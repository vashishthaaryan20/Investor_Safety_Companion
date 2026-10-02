import Ionicons from "@expo/vector-icons/Ionicons";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";

import { EmergencyBanner, EmptyState } from "@/components/sangyan/feedback";
import { HistoryRow } from "@/components/sangyan/history-row";
import { Screen } from "@/components/sangyan/screen";
import {
  AppButton,
  AppText,
  Card,
  Divider,
  IconBadge,
  SectionHeader,
  TextLink,
} from "@/components/sangyan/ui";
import { Colors, Layout, Radius, Space } from "@/constants/design";
import { isInconclusive } from "@/constants/risk";
import { requestAddScreenTile } from "@/services/screen-context";
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
    <Card style={styles.cardGap}>
      <View style={styles.rowTop}>
        <IconBadge icon="flash" color={Colors.secondary} background={Colors.secondarySoft} size={44} />
        <View style={styles.flex}>
          <AppText variant="subheading" tone="ink" accessibilityRole="header">
            Quick Capture
          </AppText>
          <AppText variant="caption" tone="muted">
            {Platform.OS === "android"
              ? "Check a screenshot straight from Quick Settings or by long-pressing the app icon."
              : "Pick a screenshot and check it in two taps."}
          </AppText>
        </View>
      </View>
      <AppButton label="Open Quick Capture" icon="flash-outline" variant="secondary" onPress={onOpen} />
      {Platform.OS === "android" && (
        <>
          <TextLink
            label={showSetup ? "Hide setup" : "Add the Quick Settings tile"}
            trailingIcon={showSetup ? "chevron-up" : "chevron-down"}
            accessibilityState={{ expanded: showSetup }}
            onPress={() => setShowSetup((value) => !value)}
          />
          {showSetup && (
            <View style={styles.setup}>
              {TILE_STEPS.map((step, index) => (
                <View key={step} style={styles.rowTop}>
                  <View style={styles.stepNumber}>
                    <AppText variant="caption" tone="brand" style={styles.bold}>
                      {index + 1}
                    </AppText>
                  </View>
                  <AppText variant="body" style={styles.flex}>
                    {step}
                  </AppText>
                </View>
              ))}
              <AppText variant="caption" tone="muted">
                {inExpoGo
                  ? "The tile and app shortcuts appear only in the installed SANGYAN Shield app, not in Expo Go."
                  : "You can also long-press the SANGYAN Shield icon and choose “Scan screenshot”."}
              </AppText>
            </View>
          )}
        </>
      )}
    </Card>
  );
}

const SCREEN_TILE_STEPS = [
  "Swipe down twice from the top of the screen",
  "Tap the pencil (Edit) button",
  "Drag the “Analyze screen” tile into your tiles",
];

function OtherAppsCard() {
  const [showSteps, setShowSteps] = useState(false);
  const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
  const packageName = Constants.expoConfig?.android?.package;

  const addTile = async () => {
    const prompted = packageName ? await requestAddScreenTile(packageName) : false;
    if (!prompted) setShowSteps(true);
  };

  return (
    <Card style={styles.cardGap}>
      <View style={styles.rowTop}>
        <IconBadge icon="layers" color={Colors.primary} background={Colors.infoSoft} size={44} />
        <View style={styles.flex}>
          <AppText variant="subheading" tone="ink" accessibilityRole="header">
            Check while using other apps
          </AppText>
          <AppText variant="caption" tone="muted">
            Seeing a tip in WhatsApp, Telegram, or a browser? Check it without leaving that app.
          </AppText>
        </View>
      </View>
      <View style={styles.setup}>
        <View style={styles.rowTop}>
          <Ionicons name="scan-outline" size={20} color={Colors.secondary} />
          <AppText style={styles.flex}>
            <AppText variant="bodyStrong" tone="ink">
              Analyze screen tile.{" "}
            </AppText>
            Tap it in Quick Settings. Android asks your permission, then we take one picture of
            that screen. Nothing is sent until you confirm.
          </AppText>
        </View>
        <View style={styles.rowTop}>
          <Ionicons name="share-social-outline" size={20} color={Colors.secondary} />
          <AppText style={styles.flex}>
            <AppText variant="bodyStrong" tone="ink">
              Share.{" "}
            </AppText>
            In any app, tap Share on a message or image and choose “Check with SANGYAN Shield”.
          </AppText>
        </View>
      </View>
      {inExpoGo ? (
        <AppText variant="caption" tone="muted">
          These work only in the installed SANGYAN Shield app, not in Expo Go.
        </AppText>
      ) : (
        <>
          <AppButton label="Add the Analyze screen tile" icon="add-circle-outline" variant="secondary" onPress={addTile} />
          <TextLink
            label={showSteps ? "Hide steps" : "Add the tile yourself"}
            trailingIcon={showSteps ? "chevron-up" : "chevron-down"}
            accessibilityState={{ expanded: showSteps }}
            onPress={() => setShowSteps((value) => !value)}
          />
          {showSteps && (
            <View style={styles.setup}>
              {SCREEN_TILE_STEPS.map((step, index) => (
                <View key={step} style={styles.rowTop}>
                  <View style={styles.stepNumber}>
                    <AppText variant="caption" tone="brand" style={styles.bold}>
                      {index + 1}
                    </AppText>
                  </View>
                  <AppText style={styles.flex}>{step}</AppText>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </Card>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const { history, resetDraft, showResult } = useScan();
  const recent = history.slice(0, RECENT_LIMIT);
  // Three side-by-side step cards get cramped on narrow phones or with large text.
  const stackSteps = width < 380 || fontScale > 1.2;
  const signWidth = Math.round(180 * Math.min(Math.max(fontScale, 1), 1.5));

  const startScan = (mode: ScanMode) => {
    resetDraft(mode);
    router.push("/scan");
  };

  const openRecord = (record: ScanRecord) => {
    showResult(record);
    router.push(isInconclusive(record.result) ? "/inconclusive" : "/result");
  };

  return (
    <Screen tabs safeTop>
      <View style={styles.brandRow}>
        <View style={styles.logo} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Ionicons name="shield-checkmark" size={22} color={Colors.inverse} />
        </View>
        <View style={styles.flex}>
          <AppText variant="heading" accessibilityRole="header">
            SANGYAN Shield
          </AppText>
          <AppText variant="caption" tone="muted">
            Check before you trust. Pause before you pay.
          </AppText>
        </View>
      </View>

      <View style={styles.hero}>
        <AppText variant="title" tone="inverse">
          Got a suspicious investment message?
        </AppText>
        <AppText tone="inverseMuted" style={styles.heroText}>
          Check it for common scam warning signs in a few seconds. Free, private, and no stock tips.
        </AppText>
        <AppButton
          label="Scan a screenshot"
          icon="scan-outline"
          variant="inverse"
          onPress={() => startScan("image")}
        />
        <AppButton
          label="Paste a message"
          icon="chatbox-ellipses-outline"
          variant="inverseSecondary"
          onPress={() => startScan("text")}
        />
      </View>

      <QuickCaptureCard onOpen={() => router.push("/quick-capture")} />

      {Platform.OS === "android" && <OtherAppsCard />}

      <View>
        <SectionHeader title="How it works" />
        <View style={[styles.steps, stackSteps && styles.stepsStacked]}>
          {HOW_IT_WORKS.map((step, index) => (
            <Card
              key={step.text}
              style={[styles.step, stackSteps && styles.stepStacked]}
            >
              <View style={styles.stepNumber}>
                <AppText variant="caption" tone="brand" style={styles.bold}>
                  {index + 1}
                </AppText>
              </View>
              <Ionicons name={step.icon} size={24} color={Colors.secondary} />
              <AppText variant="label" style={stackSteps && styles.flex}>
                {step.text}
              </AppText>
            </Card>
          ))}
        </View>
      </View>

      <View>
        <SectionHeader
          title="Recent checks"
          subtitle={recent.length ? "Tap a check to see the full result." : undefined}
          action={
            history.length > 0
              ? { label: `See all (${history.length})`, onPress: () => router.navigate("/history") }
              : undefined
          }
        />
        {recent.length ? (
          <Card style={styles.recentCard}>
            {recent.map((record, index) => (
              <View key={record.id}>
                {index > 0 && <Divider />}
                <HistoryRow record={record} onPress={() => openRecord(record)} />
              </View>
            ))}
          </Card>
        ) : (
          <Card>
            <EmptyState
              icon="time-outline"
              title="No checks yet"
              message="Your results will be saved on this phone so you can open them again."
              action={{ label: "Start your first check", icon: "scan-outline", onPress: () => startScan("image") }}
            />
          </Card>
        )}
      </View>

      <View>
        <SectionHeader
          title="Common scam signs"
          subtitle="Tap a sign to learn how it works."
          action={{ label: "Learn more", onPress: () => router.navigate("/learn") }}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.signs}
          style={styles.signsScroller}
        >
          {SCAM_SIGNS.map((sign) => (
            <Pressable
              key={sign.title}
              onPress={() =>
                router.push({ pathname: "/learn/[topic]", params: { topic: sign.topic } })
              }
              accessibilityRole="button"
              accessibilityLabel={`${sign.title}. Example: ${sign.text}`}
              accessibilityHint="Opens a lesson about this scam"
              style={({ pressed }) => pressed && { opacity: 0.8 }}
            >
              <Card style={[styles.signCard, { width: signWidth }]}>
                <Ionicons name={sign.icon} size={24} color={Colors.critical} />
                <AppText variant="bodyStrong" tone="ink">
                  {sign.title}
                </AppText>
                <AppText variant="caption" tone="muted" style={styles.flex}>
                  {sign.text}
                </AppText>
                <AppText variant="caption" tone="brand" style={styles.bold}>
                  Learn how it works
                </AppText>
              </Card>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <EmergencyBanner onPress={() => router.push("/emergency")} />

      <AppText variant="caption" tone="muted" align="center">
        SANGYAN Shield gives safety information only. It never tells you to buy, sell, or hold any
        investment.
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
  cardGap: {
    gap: Space.md,
  },
  rowTop: {
    flexDirection: "row",
    gap: Space.md,
    alignItems: "flex-start",
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: Radius.md + 2,
    backgroundColor: Colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.xl,
    padding: Space.xl,
    gap: Space.md,
  },
  heroText: {
    marginBottom: Space.xs,
  },
  setup: {
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
  },
  stepNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.secondarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  steps: {
    flexDirection: "row",
    gap: Space.sm + 2,
  },
  stepsStacked: {
    flexDirection: "column",
  },
  step: {
    flex: 1,
    padding: Space.md + 2,
    gap: Space.sm + 2,
  },
  stepStacked: {
    flexDirection: "row",
    alignItems: "center",
  },
  recentCard: {
    paddingVertical: Space.xs,
  },
  signsScroller: {
    marginHorizontal: -Layout.screenPadding,
  },
  signs: {
    gap: Space.md,
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Space.xs + 2,
  },
  signCard: {
    gap: Space.sm,
  },
});

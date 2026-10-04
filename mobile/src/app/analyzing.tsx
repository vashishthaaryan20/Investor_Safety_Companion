import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Animated, Easing, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { InlineAlert, ProgressList } from "@/components/sangyan/feedback";
import { contentWidth } from "@/components/sangyan/screen";
import { AppButton, AppText } from "@/components/sangyan/ui";
import { Colors, Gradients, Layout, Space } from "@/constants/design";
import { isInconclusive } from "@/constants/risk";
import {
  sendScreenshotForAnalysis,
  sendTextForAnalysis,
  toApiError,
} from "@/services/api";
import { useScan } from "@/state/scan-store";
import { devError } from "@/utils/dev-log";

const IMAGE_STEPS = [
  "Uploading your screenshot",
  "Reading the text in the image",
  "Looking for scam warning signs",
  "Preparing your safety guidance",
];

const TEXT_STEPS = [
  "Reading your message",
  "Looking for scam warning signs",
  "Preparing your safety guidance",
];

const STEP_INTERVAL_MS = 1800;
const SLOW_NOTICE_MS = 12000;
// Keeps instant replies from flashing the screen.
const MIN_VISIBLE_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AnalyzingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, completeScan, failScan } = useScan();
  const steps = draft.mode === "image" ? IMAGE_STEPS : TEXT_STEPS;
  const [step, setStep] = useState(0);
  const [slow, setSlow] = useState(false);
  const [pulse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_NOTICE_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  useEffect(() => {
    const timer = setInterval(
      () => setStep((current) => Math.min(current + 1, steps.length - 1)),
      STEP_INTERVAL_MS
    );
    return () => clearInterval(timer);
  }, [steps.length]);

  useEffect(() => {
    const hasInput = draft.mode === "image" ? !!draft.imageUri : !!draft.text.trim();
    if (!hasInput) {
      router.replace("/scan");
      return;
    }

    const controller = new AbortController();
    let active = true;

    const run = async () => {
      const startedAt = Date.now();
      try {
        const result =
          draft.mode === "image" && draft.imageUri
            ? await sendScreenshotForAnalysis(
                draft.imageUri,
                draft.imageName,
                draft.imageType,
                controller.signal,
                draft.captureSource,
                draft.analysisFocus
              )
            : await sendTextForAnalysis(draft.text.trim(), controller.signal, draft.analysisFocus);

        const remaining = MIN_VISIBLE_MS - (Date.now() - startedAt);
        if (remaining > 0) {
          await sleep(remaining);
        }
        if (!active) return;

        completeScan(result);
        router.replace(isInconclusive(result) ? "/inconclusive" : "/result");
      } catch (error) {
        const apiError = toApiError(error);
        if (!active || apiError.kind === "cancelled") return;
        devError("Analysis failed:", apiError.kind);
        failScan(apiError);
        router.replace("/scan-error");
      }
    };

    run();

    return () => {
      active = false;
      controller.abort();
    };
    // Runs once per visit; the draft is fixed while this screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.25] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] });

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + Space.xxxl * 1.5 }]}
      >
        <View style={styles.center}>
          <View
            style={styles.shieldWrap}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Animated.View
              style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
            />
            <View style={styles.shield}>
              <Ionicons name="shield-half-outline" size={56} color={Colors.inverse} />
            </View>
          </View>

          <AppText variant="title" align="center">
            Checking for scam signs…
          </AppText>
          <AppText tone="muted" align="center">
            {draft.mode === "image"
              ? "This can take up to 30 seconds for the first screenshot."
              : "This takes just a moment."}
          </AppText>
        </View>

        <ProgressList steps={steps} current={step} />

        {slow && (
          <InlineAlert
            tone="info"
            icon="hourglass-outline"
            title="Taking longer than usual"
            message="Still working. A slow connection or the first check after starting the server can take a little longer."
          />
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Space.lg }]}>
        <AppButton
          label="Cancel check"
          variant="secondary"
          onPress={() => router.back()}
          accessibilityHint="Stops the check. Nothing is saved."
          style={contentWidth}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
    experimental_backgroundImage: Gradients.screen,
  },
  content: {
    ...contentWidth,
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Space.xxl,
    gap: Space.xxl,
  },
  center: {
    alignItems: "center",
    gap: Space.sm,
  },
  shieldWrap: {
    width: 150,
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.lg,
  },
  ring: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: Colors.accent,
  },
  shield: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: Colors.primary,
    experimental_backgroundImage: Gradients.hero,
    borderWidth: 2,
    borderColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Space.md,
  },
});

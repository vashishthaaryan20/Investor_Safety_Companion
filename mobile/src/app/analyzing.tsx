import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton } from "@/components/sangyan/ui";
import { Palette } from "@/constants/palette";
import { isInconclusive } from "@/constants/risk";
import {
  sendScreenshotForAnalysis,
  sendTextForAnalysis,
  toApiError,
} from "@/services/api";
import { useScan } from "@/state/scan-store";

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
// Keeps instant replies from flashing the screen.
const MIN_VISIBLE_MS = 1500;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function AnalyzingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, completeScan, failScan } = useScan();
  const steps = draft.mode === "image" ? IMAGE_STEPS : TEXT_STEPS;
  const [step, setStep] = useState(0);
  const pulse = useRef(new Animated.Value(0)).current;

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
                controller.signal
              )
            : await sendTextForAnalysis(draft.text.trim(), controller.signal);

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
        console.error("Analysis failed:", apiError.kind, apiError.message);
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
    <View style={[styles.screen, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 20 }]}>
      <View style={styles.center}>
        <View style={styles.shieldWrap}>
          <Animated.View
            style={[styles.ring, { transform: [{ scale: ringScale }], opacity: ringOpacity }]}
          />
          <View style={styles.shield}>
            <Ionicons name="shield-half-outline" size={56} color="#FFFFFF" />
          </View>
        </View>

        <Text style={styles.title} accessibilityRole="header">
          Checking for scam signs…
        </Text>
        <Text style={styles.subtitle}>
          {draft.mode === "image"
            ? "This can take up to 30 seconds for the first screenshot."
            : "This takes just a moment."}
        </Text>

        <View style={styles.steps} accessibilityLiveRegion="polite">
          {steps.map((label, index) => {
            const done = index < step;
            const current = index === step;
            return (
              <View key={label} style={styles.stepRow}>
                <Ionicons
                  name={done ? "checkmark-circle" : current ? "ellipse" : "ellipse-outline"}
                  size={22}
                  color={done ? Palette.success : current ? Palette.brand : Palette.subtle}
                />
                <Text
                  style={[
                    styles.stepLabel,
                    done && styles.stepDone,
                    current && styles.stepCurrent,
                  ]}
                >
                  {label}
                </Text>
              </View>
            );
          })}
        </View>
      </View>

      <AppButton label="Cancel" variant="secondary" onPress={() => router.back()} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  center: {
    alignItems: "center",
  },
  shieldWrap: {
    width: 150,
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  ring: {
    position: "absolute",
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: Palette.brand,
  },
  shield: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: Palette.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: Palette.ink,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 15,
    color: Palette.muted,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 22,
  },
  steps: {
    marginTop: 36,
    alignSelf: "stretch",
    gap: 16,
    backgroundColor: Palette.surface,
    borderRadius: 16,
    padding: 20,
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepLabel: {
    fontSize: 16,
    color: Palette.subtle,
    fontWeight: "600",
  },
  stepDone: {
    color: Palette.muted,
  },
  stepCurrent: {
    color: Palette.ink,
    fontWeight: "800",
  },
});

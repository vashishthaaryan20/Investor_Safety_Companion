import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Card } from "@/components/sangyan/ui";
import { Palette, Radius } from "@/constants/palette";
import {
  pickImage,
  recoverPendingImage,
  type ImageSource,
  type PickedImage,
} from "@/services/image-picker";
import { useScan } from "@/state/scan-store";

type LaunchSource = "tile" | "shortcut" | "app";
type LaunchAction = "gallery" | "camera";

const SOURCE_LABEL: Record<LaunchSource, string> = {
  tile: "Opened from Quick Settings",
  shortcut: "Opened from app shortcut",
  app: "Quick Capture",
};

const STEPS = ["Capture", "Confirm", "Result"] as const;

export default function QuickCaptureScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ source?: string; action?: string }>();
  const source: LaunchSource =
    params.source === "tile" || params.source === "shortcut" ? params.source : "app";
  const action: LaunchAction | undefined =
    params.action === "gallery" || params.action === "camera" ? params.action : undefined;

  const { draft, resetDraft, updateDraft } = useScan();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const started = useRef(false);

  const image: PickedImage | null =
    draft.mode === "image" && draft.imageUri
      ? { uri: draft.imageUri, name: draft.imageName, type: draft.imageType }
      : null;

  const usePicked = (picked: PickedImage) => {
    setNotice(null);
    updateDraft({
      mode: "image",
      imageUri: picked.uri,
      imageName: picked.name,
      imageType: picked.type,
      captureSource: source === "app" ? "quick-capture" : `quick-capture-${source}`,
    });
  };

  const capture = async (from: ImageSource) => {
    setBusy(true);
    const result = await pickImage(from);
    setBusy(false);
    if (result.status === "picked") {
      usePicked(result.image);
    } else if (result.status === "cancelled") {
      setNotice("No screenshot selected. Choose one below when you're ready.");
    } else if (result.status === "denied") {
      setNotice("Camera access is off. You can still choose a screenshot from your gallery.");
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    resetDraft("image");

    const start = async () => {
      const recovered = await recoverPendingImage();
      if (recovered) {
        usePicked(recovered);
        return;
      }
      if (action) {
        await capture(action === "camera" ? "camera" : "library");
      }
    };
    start();
    // Runs once per launch; params are fixed for this screen instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    resetDraft("image");
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const analyze = () => {
    if (!image) return;
    router.push("/analyzing");
  };

  const stepIndex = image ? 1 : 0;

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: "Quick Capture",
          headerLeft: () => (
            <Pressable
              onPress={close}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close Quick Capture"
              style={styles.headerButton}
            >
              <Ionicons name="close" size={26} color={Palette.navy} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sourceRow}>
          <Ionicons
            name={source === "tile" ? "apps-outline" : source === "shortcut" ? "flash-outline" : "scan-outline"}
            size={15}
            color={Palette.brand}
          />
          <Text style={styles.sourceText}>{SOURCE_LABEL[source]}</Text>
        </View>

        <View style={styles.stepper} accessibilityLabel={`Step ${stepIndex + 1} of 3`}>
          {STEPS.map((label, index) => (
            <View key={label} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  index < stepIndex && styles.stepDotDone,
                  index === stepIndex && styles.stepDotActive,
                ]}
              >
                {index < stepIndex ? (
                  <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                ) : (
                  <Text style={[styles.stepNumber, index === stepIndex && styles.stepNumberActive]}>
                    {index + 1}
                  </Text>
                )}
              </View>
              <Text style={[styles.stepLabel, index === stepIndex && styles.stepLabelActive]}>
                {label}
              </Text>
            </View>
          ))}
        </View>

        {image ? (
          <>
            <Text style={styles.title} accessibilityRole="header">
              Is this the right screenshot?
            </Text>
            <Card style={styles.previewCard}>
              <Image
                source={{ uri: image.uri }}
                style={styles.preview}
                resizeMode="contain"
                accessibilityLabel="Screenshot to check"
              />
            </Card>
            <View style={styles.previewActions}>
              <AppButton
                label="Choose another"
                icon="images-outline"
                variant="secondary"
                onPress={() => capture("library")}
                disabled={busy}
                style={styles.flex}
              />
              <AppButton
                label="Retake"
                icon="camera-outline"
                variant="secondary"
                onPress={() => capture("camera")}
                disabled={busy}
                style={styles.flex}
              />
            </View>
            <View style={styles.privacy}>
              <Ionicons name="lock-closed-outline" size={18} color={Palette.muted} />
              <Text style={styles.privacyText}>
                Only this image is sent for checking. The image itself is never stored, on the
                server or in your history. Hide bank details and OTPs if you can.
              </Text>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.title} accessibilityRole="header">
              Check a suspicious screenshot
            </Text>
            <Text style={styles.lead}>
              Took a screenshot of a tip, offer, or payment request? Pick it and we&apos;ll look for
              scam warning signs.
            </Text>
            {notice && (
              <View style={styles.notice} accessibilityLiveRegion="polite">
                <Ionicons name="information-circle-outline" size={20} color={Palette.caution} />
                <Text style={styles.noticeText}>{notice}</Text>
              </View>
            )}
            <Pressable
              onPress={() => capture("library")}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.optionIcon, { backgroundColor: Palette.brand }]}>
                <Ionicons name="images" size={28} color="#FFFFFF" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.optionTitle}>Choose a screenshot</Text>
                <Text style={styles.optionText}>Your latest screenshots appear first</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Palette.subtle} />
            </Pressable>
            <Pressable
              onPress={() => capture("camera")}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.option, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.optionIcon, { backgroundColor: Palette.navy }]}>
                <Ionicons name="camera" size={28} color="#FFFFFF" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.optionTitle}>Take a photo</Text>
                <Text style={styles.optionText}>Photograph a poster, ad, or another screen</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Palette.subtle} />
            </Pressable>
          </>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        {image ? (
          <AppButton label="Analyze now" icon="shield-checkmark" onPress={analyze} loading={busy} />
        ) : (
          <AppButton label="Cancel" variant="secondary" onPress={close} />
        )}
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
    paddingBottom: 24,
    gap: 18,
  },
  flex: {
    flex: 1,
  },
  headerButton: {
    marginRight: 8,
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: Palette.brandSoft,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: Radius.pill,
  },
  sourceText: {
    fontSize: 13,
    fontWeight: "700",
    color: Palette.brand,
  },
  stepper: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  stepItem: {
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Palette.background,
    borderWidth: 1.5,
    borderColor: Palette.border,
  },
  stepDotActive: {
    borderColor: Palette.brand,
    backgroundColor: Palette.brandSoft,
  },
  stepDotDone: {
    backgroundColor: Palette.success,
    borderColor: Palette.success,
  },
  stepNumber: {
    fontSize: 13,
    fontWeight: "800",
    color: Palette.subtle,
  },
  stepNumberActive: {
    color: Palette.brand,
  },
  stepLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: Palette.muted,
  },
  stepLabelActive: {
    color: Palette.ink,
    fontWeight: "800",
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: Palette.ink,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    color: Palette.muted,
    marginTop: -8,
  },
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: Radius.md,
    backgroundColor: Palette.cautionSoft,
  },
  noticeText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Palette.text,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: Radius.lg,
    backgroundColor: Palette.surface,
    borderWidth: 1.5,
    borderColor: Palette.border,
  },
  optionIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  optionTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: Palette.ink,
  },
  optionText: {
    fontSize: 13,
    lineHeight: 18,
    color: Palette.muted,
    marginTop: 2,
  },
  previewCard: {
    padding: 8,
  },
  preview: {
    width: "100%",
    height: 420,
    borderRadius: Radius.md,
    backgroundColor: Palette.background,
  },
  previewActions: {
    flexDirection: "row",
    gap: 10,
  },
  privacy: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    color: Palette.muted,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Palette.background,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
});

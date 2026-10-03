import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Image, StyleSheet, View } from "react-native";

import { PickResultNotice, Stepper } from "@/components/sangyan/feedback";
import { Screen } from "@/components/sangyan/screen";
import {
  AppButton,
  AppText,
  Card,
  IconButton,
  InfoNote,
  SendDisclosure,
  OptionCard,
} from "@/components/sangyan/ui";
import { Colors, Radius, Space } from "@/constants/design";
import {
  pickImage,
  recoverPendingImage,
  type ImageSource,
  type PickedImage,
  type PickResult,
} from "@/services/image-picker";
import { useScan } from "@/state/scan-store";

type LaunchSource = "tile" | "shortcut" | "app";
type LaunchAction = "gallery" | "camera";
type PickNotice = Exclude<PickResult, { status: "picked" }> & { source: ImageSource };

const SOURCE_LABEL: Record<LaunchSource, string> = {
  tile: "Opened from Quick Settings",
  shortcut: "Opened from app shortcut",
  app: "Quick Capture",
};

const STEPS = ["Capture", "Confirm", "Result"] as const;

export default function QuickCaptureScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ source?: string; action?: string }>();
  const source: LaunchSource =
    params.source === "tile" || params.source === "shortcut" ? params.source : "app";
  const action: LaunchAction | undefined =
    params.action === "gallery" || params.action === "camera" ? params.action : undefined;

  const { draft, resetDraft, updateDraft } = useScan();
  const [picking, setPicking] = useState<ImageSource | null>(null);
  const [notice, setNotice] = useState<PickNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const started = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setSubmitting(false);
    }, [])
  );

  const image: PickedImage | null =
    draft.mode === "image" && draft.imageUri
      ? { uri: draft.imageUri, name: draft.imageName, type: draft.imageType }
      : null;

  const applyPicked = (picked: PickedImage) => {
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
    if (picking) return;
    setNotice(null);
    setPicking(from);
    const result = await pickImage(from);
    setPicking(null);
    if (result.status === "picked") {
      applyPicked(result.image);
    } else {
      setNotice({ ...result, source: from });
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    resetDraft("image");

    // Images only come from the picker or camera here. File paths in deep links are ignored:
    // any app can open a link, and it must not be able to queue a file for upload.
    const start = async () => {
      const recovered = await recoverPendingImage();
      if (recovered) {
        applyPicked(recovered);
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
    router.dismissTo("/");
  };

  const analyze = () => {
    if (!image || submitting) return;
    setSubmitting(true);
    router.push("/analyzing");
  };

  const stepIndex = image ? 1 : 0;

  const footer = image ? (
    <AppButton
      label="Analyze now"
      icon="shield-checkmark"
      onPress={analyze}
      loading={submitting}
      loadingLabel="Starting check…"
      disabled={!!picking}
    />
  ) : (
    <AppButton label="Cancel" variant="secondary" onPress={close} />
  );

  return (
    <Screen footer={footer}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <IconButton icon="close" label="Close Quick Capture" onPress={close} size={26} />
          ),
        }}
      />

      <View style={styles.section}>
        <View style={styles.sourceRow}>
          <Ionicons
            name={source === "tile" ? "apps-outline" : source === "shortcut" ? "flash-outline" : "scan-outline"}
            size={15}
            color={Colors.secondary}
          />
          <AppText variant="caption" tone="brand" style={styles.bold}>
            {SOURCE_LABEL[source]}
          </AppText>
        </View>
        <Stepper steps={STEPS} current={stepIndex} />
      </View>

      {image ? (
        <View style={styles.section}>
          <AppText variant="title">Is this the right screenshot?</AppText>
          <Card style={styles.previewCard}>
            <Image
              source={{ uri: image.uri }}
              style={styles.preview}
              resizeMode="contain"
              accessibilityLabel="Screenshot to check"
            />
          </Card>
          <View style={styles.row}>
            <AppButton
              label="Choose another"
              icon="images-outline"
              variant="secondary"
              compact
              loading={picking === "library"}
              disabled={!!picking || submitting}
              onPress={() => capture("library")}
              style={styles.flex}
            />
            <AppButton
              label="Retake"
              icon="camera-outline"
              variant="secondary"
              compact
              loading={picking === "camera"}
              disabled={!!picking || submitting}
              onPress={() => capture("camera")}
              style={styles.flex}
            />
          </View>
          {notice && <PickResultNotice result={notice} onRetry={capture} />}
          <InfoNote icon="eye-outline">
            Make sure this is the screenshot you meant. Hide bank details and OTPs if you can.
          </InfoNote>
          <SendDisclosure kind="image" action="Analyze now" />
        </View>
      ) : (
        <View style={styles.section}>
          <AppText variant="title">Check a suspicious screenshot</AppText>
          <AppText tone="muted">
            Took a screenshot of a tip, offer, or payment request? Pick it and we&apos;ll look for
            scam warning signs.
          </AppText>
          {notice && <PickResultNotice result={notice} onRetry={capture} />}
          <OptionCard
            icon="images"
            title="Choose a screenshot"
            description="Your latest screenshots appear first"
            loading={picking === "library"}
            disabled={!!picking}
            onPress={() => capture("library")}
          />
          <OptionCard
            icon="camera"
            title="Take a photo"
            description="Photograph a poster, ad, or another screen"
            iconBackground={Colors.primary}
            loading={picking === "camera"}
            disabled={!!picking}
            onPress={() => capture("camera")}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Space.md,
  },
  row: {
    flexDirection: "row",
    gap: Space.sm,
  },
  flex: {
    flex: 1,
  },
  bold: {
    fontWeight: "700",
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs + 2,
    alignSelf: "flex-start",
    backgroundColor: Colors.secondarySoft,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs + 1,
    borderRadius: Radius.pill,
  },
  previewCard: {
    padding: Space.sm,
  },
  preview: {
    width: "100%",
    height: 400,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
  },
});

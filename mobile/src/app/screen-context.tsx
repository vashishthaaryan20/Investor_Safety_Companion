import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, Image, Pressable, StyleSheet, View } from "react-native";

import { LoadingState, StatusScreen } from "@/components/sangyan/feedback";
import { Screen } from "@/components/sangyan/screen";
import {
  AppButton,
  AppText,
  BulletList,
  Card,
  IconButton,
  InfoNote,
  SendDisclosure,
  SectionHeader,
  TextLink,
  type IconName,
} from "@/components/sangyan/ui";
import { DEFAULT_FOCUS, FOCUS_OPTIONS, type AnalysisFocus } from "@/constants/analysis-focus";
import { Colors, Radius, Space, type Tone } from "@/constants/design";
import {
  deleteTempFile,
  loadCapture,
  parseErrorKind,
  type ContextErrorKind,
  type ContextSource,
  type LoadedContext,
} from "@/services/screen-context";
import { useScan } from "@/state/scan-store";
import { confirmAction } from "@/utils/confirm";

type ViewState =
  | { status: "loading" }
  | { status: "error"; kind: ContextErrorKind }
  | { status: "ready"; content: LoadedContext };

interface ErrorCopy {
  tone: Tone;
  icon: IconName;
  eyebrow: string;
  title: string;
  message: string;
  tips?: string[];
}

const PROTECTED_TIPS = [
  "Copy the message text, then open SANGYAN Shield and paste it.",
  "Or use Share in that app and choose “Check with SANGYAN Shield”.",
  "Or photograph the screen with another phone and check the photo.",
];

const ERROR_COPY: Record<ContextErrorKind, ErrorCopy> = {
  denied: {
    tone: "info",
    icon: "eye-off-outline",
    eyebrow: "Screen check cancelled",
    title: "Nothing was captured",
    message: "You chose not to share your screen, so nothing was captured or sent.",
  },
  blank: {
    tone: "caution",
    icon: "lock-closed-outline",
    eyebrow: "Protected screen",
    title: "This screen can't be captured",
    message:
      "The app you were using blocks screen pictures. Banking and payment apps often do this to protect you. Nothing was sent.",
    tips: PROTECTED_TIPS,
  },
  timeout: {
    tone: "caution",
    icon: "hourglass-outline",
    eyebrow: "Capture failed",
    title: "The capture took too long",
    message: "We couldn't get a picture of your screen. Nothing was sent. Please try again.",
  },
  stopped: {
    tone: "info",
    icon: "stop-circle-outline",
    eyebrow: "Capture stopped",
    title: "Screen sharing stopped",
    message: "Sharing ended before the picture was taken, so nothing was captured or sent.",
  },
  failed: {
    tone: "critical",
    icon: "alert-circle-outline",
    eyebrow: "Capture failed",
    title: "Something went wrong",
    message: "We couldn't prepare this for checking. Nothing was sent. Please try again.",
  },
  unsupported: {
    tone: "caution",
    icon: "document-outline",
    eyebrow: "Can't check this",
    title: "This type of content isn't supported",
    message: "SANGYAN Shield can check screenshots, photos, and text messages.",
  },
  unreadable: {
    tone: "caution",
    icon: "image-outline",
    eyebrow: "Can't open this",
    title: "We couldn't open that image",
    message: "It may be damaged or in an unusual format. Try sharing a normal screenshot.",
  },
  empty: {
    tone: "info",
    icon: "document-text-outline",
    eyebrow: "Nothing to check",
    title: "The shared message was empty",
    message: "Select the text of the message before you share it.",
  },
  missing: {
    tone: "info",
    icon: "time-outline",
    eyebrow: "No longer available",
    title: "This capture has expired",
    message:
      "Captures are deleted soon after use to protect your privacy. Please capture or share it again.",
  },
};

const SOURCE_BADGE: Record<ContextSource, { icon: IconName; label: string }> = {
  tile: { icon: "scan-outline", label: "Captured from your screen" },
  share: { icon: "share-social-outline", label: "Shared from another app" },
};

const TEXT_PREVIEW_CHARS = 600;

export default function ScreenContextScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    source?: string;
    kind?: string;
    capture?: string;
    error?: string;
  }>();
  const source: ContextSource = params.source === "share" ? "share" : "tile";
  const { resetDraft, updateDraft } = useScan();
  const [state, setState] = useState<ViewState>({ status: "loading" });
  const [focus, setFocus] = useState<AnalysisFocus>(DEFAULT_FOCUS);
  const [submitting, setSubmitting] = useState(false);
  const [showFullText, setShowFullText] = useState(false);

  useEffect(() => {
    let active = true;
    setFocus(DEFAULT_FOCUS);
    setShowFullText(false);

    if (params.error) {
      resetDraft("image");
      setState({ status: "error", kind: parseErrorKind(params.error) });
      return;
    }

    setState({ status: "loading" });
    loadCapture(params.capture, params.kind).then((content) => {
      if (!active) return;
      if (!content) {
        resetDraft("image");
        setState({ status: "error", kind: "missing" });
        return;
      }
      resetDraft(content.kind);
      updateDraft(
        content.kind === "image"
          ? {
              mode: "image",
              imageUri: content.uri,
              imageName: "screen.jpg",
              imageType: "image/jpeg",
              captureSource: `screen-context-${source}`,
            }
          : { mode: "text", text: content.text, captureSource: `screen-context-${source}` }
      );
      setState({ status: "ready", content });
    });
    return () => {
      active = false;
    };
    // A new tile capture or share reopens this screen with new params.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.capture, params.error]);

  useFocusEffect(
    useCallback(() => {
      setSubmitting(false);
    }, [])
  );

  // Always Home: older instances of this screen can sit lower in the stack with deleted captures.
  const cancel = useCallback(() => {
    // resetDraft deletes the temporary capture file.
    resetDraft("image");
    router.dismissTo("/");
  }, [resetDraft, router]);

  // Hardware Back counts as Cancel, so the capture is deleted.
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        cancel();
        return true;
      });
      return () => subscription.remove();
    }, [cancel])
  );

  const retakeFromScreen = async () => {
    const confirmed = await confirmAction({
      title: "Capture again?",
      message:
        "SANGYAN Shield will close. Go to the screen you want to check, then tap “Analyze screen” in Quick Settings.",
      confirmLabel: "Close and capture again",
    });
    if (!confirmed) return;
    if (state.status === "ready" && state.content.kind === "image") {
      deleteTempFile(state.content.uri);
    }
    resetDraft("image");
    BackHandler.exitApp();
  };

  const chooseFromGallery = () => {
    resetDraft("image");
    router.replace({ pathname: "/quick-capture", params: { action: "gallery" } });
  };

  const submit = () => {
    if (state.status !== "ready" || submitting) return;
    setSubmitting(true);
    updateDraft({ analysisFocus: focus });
    router.push("/analyzing");
  };

  const header = (
    <Stack.Screen
      options={{
        headerLeft: () => (
          <IconButton icon="close" label="Cancel and delete this capture" onPress={cancel} size={26} />
        ),
      }}
    />
  );

  if (state.status === "loading") {
    return (
      <Screen>
        {header}
        <LoadingState label="Opening what you shared…" />
      </Screen>
    );
  }

  if (state.status === "error") {
    const copy = ERROR_COPY[state.kind];
    const fromTile = source === "tile" && state.kind !== "missing";
    return (
      <StatusScreen
        tone={copy.tone}
        icon={copy.icon}
        eyebrow={copy.eyebrow}
        title={copy.title}
        message={copy.message}
        actions={
          <>
            {fromTile && state.kind !== "blank" && (
              <AppButton label="Capture again" icon="scan-outline" onPress={retakeFromScreen} />
            )}
            <AppButton
              label="Choose a screenshot instead"
              icon="images-outline"
              variant={fromTile && state.kind !== "blank" ? "secondary" : "primary"}
              onPress={chooseFromGallery}
            />
            <AppButton label="Go home" variant="tertiary" onPress={() => router.dismissTo("/")} />
          </>
        }
      >
        {copy.tips && (
          <Card>
            <SectionHeader icon="bulb-outline" title="What you can do instead" />
            <BulletList items={copy.tips} />
          </Card>
        )}
      </StatusScreen>
    );
  }

  const { content } = state;
  const badge = SOURCE_BADGE[source];
  const text = content.kind === "text" ? content.text : "";
  const isLongText = text.length > TEXT_PREVIEW_CHARS;
  const visibleText =
    isLongText && !showFullText ? `${text.slice(0, TEXT_PREVIEW_CHARS).trimEnd()}…` : text;

  const footer = (
    <View style={styles.footer}>
      <AppButton
        label="Send for checking"
        icon="shield-checkmark"
        onPress={submit}
        loading={submitting}
        loadingLabel="Starting check…"
        accessibilityHint="Sends only this content to SANGYAN Shield for checking"
      />
      <AppButton label="Cancel" variant="tertiary" onPress={cancel} disabled={submitting} />
    </View>
  );

  return (
    <Screen footer={footer}>
      {header}

      <View style={styles.section}>
        <View style={styles.sourceRow} accessible accessibilityLabel={`Source: ${badge.label}`}>
          <Ionicons name={badge.icon} size={15} color={Colors.secondary} />
          <AppText variant="caption" tone="brand" style={styles.bold}>
            {badge.label}
            {content.kind === "image" ? " · Screenshot" : " · Text"}
          </AppText>
        </View>
        <AppText variant="title">
          {content.kind === "image" ? "Check this screen?" : "Check this message?"}
        </AppText>
        <AppText tone="muted">
          Nothing has been sent yet. Review it below, pick what you want to know, then send it for
          checking.
        </AppText>
      </View>

      {content.kind === "image" ? (
        <View style={styles.section}>
          <Card style={styles.previewCard}>
            <Image
              source={{ uri: content.uri }}
              style={styles.preview}
              resizeMode="contain"
              accessibilityLabel="Picture of your screen to check"
            />
          </Card>
          <View style={styles.row}>
            {source === "tile" ? (
              <AppButton
                label="Capture again"
                icon="scan-outline"
                variant="secondary"
                compact
                disabled={submitting}
                onPress={retakeFromScreen}
                style={styles.flex}
              />
            ) : null}
            <AppButton
              label="Choose from gallery"
              icon="images-outline"
              variant="secondary"
              compact
              disabled={submitting}
              onPress={chooseFromGallery}
              style={styles.flex}
            />
          </View>
          <InfoNote icon="eye-outline">
            The picture shows everything that was on your screen, including notifications. If it
            shows something private, such as an OTP or bank balance, tap Cancel.
          </InfoNote>
        </View>
      ) : (
        <Card style={styles.textCard}>
          <AppText variant="overline" tone="muted">
            Shared text
          </AppText>
          <AppText selectable>{visibleText}</AppText>
          {isLongText && (
            <TextLink
              label={showFullText ? "Show less" : "Show full text"}
              trailingIcon={showFullText ? "chevron-up" : "chevron-down"}
              accessibilityState={{ expanded: showFullText }}
              onPress={() => setShowFullText((value) => !value)}
            />
          )}
        </Card>
      )}

      <View>
        <SectionHeader
          icon="help-circle-outline"
          title="What do you want to know?"
          subtitle="Every check looks for scam signs. Your choice decides which answer appears first."
        />
        <View style={styles.options} accessibilityRole="radiogroup">
          {FOCUS_OPTIONS.map((option) => {
            const selected = option.id === focus;
            return (
              <Pressable
                key={option.id}
                onPress={() => setFocus(option.id)}
                disabled={submitting}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected, disabled: submitting }}
                accessibilityLabel={`${option.label}. ${option.description}`}
                style={({ pressed }) => [
                  styles.option,
                  selected && styles.optionSelected,
                  pressed && !selected && { backgroundColor: Colors.surfaceMuted },
                ]}
              >
                <Ionicons
                  name={option.icon}
                  size={22}
                  color={selected ? Colors.secondary : Colors.muted}
                />
                <View style={styles.flex}>
                  <AppText variant="bodyStrong" tone={selected ? "ink" : "default"}>
                    {option.label}
                  </AppText>
                  <AppText variant="caption" tone="muted">
                    {option.description}
                  </AppText>
                </View>
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={22}
                  color={selected ? Colors.secondary : Colors.subtle}
                />
              </Pressable>
            );
          })}
        </View>
      </View>

      <SendDisclosure kind={content.kind} action="Send for checking" />
      <InfoNote icon="eye-off-outline">
        SANGYAN Shield never watches your screen in the background. It takes one picture only when
        you tap the tile, then stops.
      </InfoNote>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  bold: {
    fontWeight: "700",
  },
  section: {
    gap: Space.md,
  },
  row: {
    flexDirection: "row",
    gap: Space.sm,
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
    height: 420,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
  },
  textCard: {
    gap: Space.sm,
  },
  options: {
    gap: Space.sm,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    minHeight: 56,
    padding: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionSelected: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondarySoft,
  },
  footer: {
    gap: Space.xs,
  },
});

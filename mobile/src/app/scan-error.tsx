import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { AccessibilityInfo, StyleSheet, View } from "react-native";

import { StatusScreen } from "@/components/sangyan/feedback";
import {
  AppButton,
  AppText,
  BulletList,
  Card,
  SectionHeader,
  TextLink,
  type IconName,
} from "@/components/sangyan/ui";
import { Colors, Radius, Space, Typography } from "@/constants/design";
import { API_BASE_URL, type ApiErrorKind } from "@/services/api";
import { useScan } from "@/state/scan-store";

interface ErrorCopy {
  icon: IconName;
  title: string;
  message: string;
  tips: string[];
}

const ERROR_COPY: Record<ApiErrorKind, ErrorCopy> = {
  network: {
    icon: "cloud-offline-outline",
    title: "Can't connect right now",
    message: "We couldn't reach the SANGYAN Shield server. Your content was not checked.",
    tips: [
      "Check that your internet or Wi-Fi is turned on.",
      "If you are testing locally, keep the phone and laptop on the same Wi-Fi.",
      "Make sure the SANGYAN server is running, then try again.",
    ],
  },
  timeout: {
    icon: "hourglass-outline",
    title: "This is taking too long",
    message: "The check didn't finish in time. This can happen on a slow connection.",
    tips: [
      "Move to a spot with a better signal and try again.",
      "Crop the screenshot to just the message so it uploads faster.",
      "Paste the message as text, which needs much less data.",
    ],
  },
  invalid_input: {
    icon: "image-outline",
    title: "We couldn't use that file",
    message: "The screenshot couldn't be opened. It may be damaged or in an unsupported format.",
    tips: [
      "Choose a normal screenshot (JPG or PNG).",
      "Take a fresh screenshot and try again.",
      "Or paste the message as text instead.",
    ],
  },
  too_large: {
    icon: "resize-outline",
    title: "This screenshot is too large",
    message: "Images must be under 10 MB. Nothing was checked.",
    tips: [
      "Crop the screenshot to just the message, then try again.",
      "Take a normal screenshot instead of a high-resolution photo.",
      "Or paste the message as text instead.",
    ],
  },
  rate_limited: {
    icon: "timer-outline",
    title: "Too many checks in a short time",
    message: "To keep the service available for everyone, please wait a minute.",
    tips: ["Wait about a minute, then tap Try again."],
  },
  insecure: {
    icon: "lock-open-outline",
    title: "Connection not secure",
    message:
      "SANGYAN Shield only sends your content over a secure connection. Nothing was sent.",
    tips: [
      "This app version is set up to use an unsecured server address.",
      "Update the app, or ask whoever set it up to use an https:// server address.",
    ],
  },
  server: {
    icon: "construct-outline",
    title: "Something went wrong on our side",
    message: "The server had a problem while checking your content. It's not your fault.",
    tips: ["Wait a few seconds and try again.", "If it keeps happening, paste the message as text."],
  },
  bad_response: {
    icon: "construct-outline",
    title: "Something went wrong on our side",
    message: "We received an unexpected reply from the server.",
    tips: ["Wait a few seconds and try again.", "If it keeps happening, paste the message as text."],
  },
  cancelled: {
    icon: "close-circle-outline",
    title: "Check cancelled",
    message: "The check was stopped before it finished.",
    tips: ["Try again when you're ready."],
  },
};

const INVALID_TEXT_COPY: ErrorCopy = {
  icon: "chatbox-ellipses-outline",
  title: "We couldn't check that message",
  message: "The message was empty or too long to check.",
  tips: [
    "Paste only the suspicious message, not a whole chat.",
    "Messages up to about 20,000 characters can be checked.",
  ],
};

export default function ScanErrorScreen() {
  const router = useRouter();
  const { error, draft } = useScan();
  const [showDetails, setShowDetails] = useState(false);
  const kind = error?.kind ?? "network";
  const copy = kind === "invalid_input" && draft.mode === "text" ? INVALID_TEXT_COPY : ERROR_COPY[kind];
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(`Check not completed. ${copy.title}.`);
  }, [copy.title]);

  const retry = () => {
    if (retrying) return;
    setRetrying(true);
    router.replace("/analyzing");
  };

  return (
    <StatusScreen
      tone="critical"
      icon={copy.icon}
      eyebrow="Check not completed"
      title={copy.title}
      message={copy.message}
      actions={
        <>
          <AppButton label="Try again" icon="refresh" onPress={retry} loading={retrying} />
          <AppButton
            label={draft.mode === "image" ? "Choose a different screenshot" : "Edit the message"}
            icon="create-outline"
            variant="secondary"
            onPress={() => router.dismissTo("/scan")}
          />
          <AppButton label="Go home" variant="tertiary" onPress={() => router.dismissTo("/")} />
        </>
      }
    >
      <Card>
        <SectionHeader icon="bulb-outline" title="What you can try" />
        <BulletList items={copy.tips} />
      </Card>

      <View style={styles.details}>
        <TextLink
          label={showDetails ? "Hide technical details" : "Show technical details"}
          trailingIcon={showDetails ? "chevron-up" : "chevron-down"}
          tone="muted"
          accessibilityState={{ expanded: showDetails }}
          onPress={() => setShowDetails((value) => !value)}
          style={styles.detailsToggle}
        />
        {showDetails && (
          <AppText variant="caption" tone="muted" style={styles.detailsText} selectable>
            Error type: {kind}
            {"\n"}Server: {API_BASE_URL}
            {error?.message ? `\nMessage: ${error.message}` : ""}
          </AppText>
        )}
      </View>
    </StatusScreen>
  );
}

const styles = StyleSheet.create({
  details: {
    gap: Space.sm,
  },
  detailsToggle: {
    alignSelf: "center",
  },
  detailsText: {
    ...Typography.mono,
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.sm,
    padding: Space.md,
  },
});

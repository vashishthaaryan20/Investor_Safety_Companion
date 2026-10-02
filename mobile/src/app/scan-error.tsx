import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { useState, type ComponentProps } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { AppButton, BulletList, Card, SectionHeader, StatusScreen } from "@/components/sangyan/ui";
import { Palette } from "@/constants/palette";
import { API_BASE_URL, type ApiErrorKind } from "@/services/api";
import { useScan } from "@/state/scan-store";

interface ErrorCopy {
  icon: ComponentProps<typeof Ionicons>["name"];
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

export default function ScanErrorScreen() {
  const router = useRouter();
  const { error, draft } = useScan();
  const [showDetails, setShowDetails] = useState(false);
  const kind = error?.kind ?? "network";
  const copy = ERROR_COPY[kind];

  return (
    <StatusScreen
      icon={copy.icon}
      color={Palette.danger}
      background={Palette.dangerSoft}
      eyebrow="Check not completed"
      title={copy.title}
      message={copy.message}
      actions={
        <>
          <AppButton label="Try again" icon="refresh" onPress={() => router.replace("/analyzing")} />
          <AppButton
            label={draft.mode === "image" ? "Choose a different screenshot" : "Edit the message"}
            icon="create-outline"
            variant="secondary"
            onPress={() => router.dismissTo("/scan")}
          />
          <AppButton label="Go home" variant="ghost" onPress={() => router.dismissTo("/")} />
        </>
      }
    >
      <Card>
        <SectionHeader icon="bulb-outline" title="What you can try" />
        <BulletList items={copy.tips} />
      </Card>

      <View style={styles.details}>
        <Pressable onPress={() => setShowDetails((value) => !value)} hitSlop={8}>
          <Text style={styles.detailsToggle}>
            {showDetails ? "Hide technical details" : "Show technical details"}
          </Text>
        </Pressable>
        {showDetails && (
          <Text style={styles.detailsText} selectable>
            Error type: {kind}
            {"\n"}Server: {API_BASE_URL}
            {error?.message ? `\nMessage: ${error.message}` : ""}
          </Text>
        )}
      </View>
    </StatusScreen>
  );
}

const styles = StyleSheet.create({
  details: {
    alignItems: "center",
    gap: 10,
  },
  detailsToggle: {
    fontSize: 14,
    fontWeight: "700",
    color: Palette.muted,
  },
  detailsText: {
    alignSelf: "stretch",
    fontSize: 12,
    lineHeight: 18,
    color: Palette.muted,
    fontFamily: "monospace",
    backgroundColor: "#EEF1F6",
    borderRadius: 8,
    padding: 12,
  },
});

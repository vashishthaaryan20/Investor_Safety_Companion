import { Redirect, useRouter } from "expo-router";
import { useEffect } from "react";
import { AccessibilityInfo } from "react-native";

import { InlineAlert, StatusScreen } from "@/components/sangyan/feedback";
import { AppButton, AppText, BulletList, Card, SectionHeader } from "@/components/sangyan/ui";
import { Colors } from "@/constants/design";
import { useScan, type ScanMode } from "@/state/scan-store";

const BETTER_SCREENSHOT_TIPS = [
  "Make sure the message text is clearly visible and not blurry.",
  "Crop out empty space so the message fills most of the screenshot.",
  "Avoid photos of a screen. Take a real screenshot on your phone instead.",
  "If the message is long, paste it as text instead.",
];

const STAY_SAFE_TIPS = [
  "Don't send money or share OTPs until you have verified the sender.",
  "Real investments never guarantee profits.",
  "Check any adviser or company on SEBI's official website.",
];

export default function InconclusiveScreen() {
  const router = useRouter();
  const { result, resetDraft } = useScan();

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(
      "Check finished, but no result could be established."
    );
  }, []);

  if (!result) {
    return <Redirect href="/" />;
  }

  const restart = (mode: ScanMode) => {
    resetDraft(mode);
    router.dismissTo("/scan");
  };

  const partialText = result.extracted_text?.trim();

  return (
    <StatusScreen
      tone="neutral"
      icon="help-circle-outline"
      eyebrow="Result unclear"
      title="No result could be established"
      message={result.explanation}
      actions={
        <>
          <AppButton
            label="Try another screenshot"
            icon="image-outline"
            onPress={() => restart("image")}
          />
          <AppButton
            label="Paste the message instead"
            icon="chatbox-ellipses-outline"
            variant="secondary"
            onPress={() => restart("text")}
          />
          <AppButton label="Go home" variant="tertiary" onPress={() => router.dismissTo("/")} />
        </>
      }
    >
      <InlineAlert
        tone="caution"
        title="This is not a “safe” result"
        message="We couldn't read enough to look for warning signs. Treat the message with care until you can check it properly."
      />
      {!!partialText && (
        <Card>
          <SectionHeader title="What we could read" />
          <AppText tone="muted" style={{ fontStyle: "italic" }}>
            {partialText}
          </AppText>
        </Card>
      )}
      <Card>
        <SectionHeader icon="bulb-outline" title="Tips for a better check" />
        <BulletList items={BETTER_SCREENSHOT_TIPS} />
      </Card>
      <Card>
        <SectionHeader icon="shield-outline" title="Stay safe meanwhile" />
        <BulletList items={STAY_SAFE_TIPS} color={Colors.success} />
      </Card>
    </StatusScreen>
  );
}

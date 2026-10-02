import { Redirect, useRouter } from "expo-router";
import { StyleSheet, Text } from "react-native";

import { AppButton, BulletList, Card, SectionHeader, StatusScreen } from "@/components/sangyan/ui";
import { Palette } from "@/constants/palette";
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
      icon="eye-off-outline"
      color={Palette.caution}
      background={Palette.cautionSoft}
      eyebrow="Result unclear"
      title="We couldn't read enough"
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
          <AppButton label="Go home" variant="ghost" onPress={() => router.dismissTo("/")} />
        </>
      }
    >
      {!!partialText && (
        <Card>
          <SectionHeader title="What we could read" />
          <Text style={styles.partial}>{partialText}</Text>
        </Card>
      )}
      <Card>
        <SectionHeader icon="bulb-outline" title="Tips for a better check" />
        <BulletList items={BETTER_SCREENSHOT_TIPS} />
      </Card>
      <Card>
        <SectionHeader icon="shield-outline" title="Stay safe meanwhile" />
        <BulletList items={STAY_SAFE_TIPS} color={Palette.success} />
      </Card>
    </StatusScreen>
  );
}

const styles = StyleSheet.create({
  partial: {
    fontSize: 15,
    lineHeight: 22,
    color: Palette.muted,
    fontStyle: "italic",
  },
});

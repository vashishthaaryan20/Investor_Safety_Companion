import Ionicons from "@expo/vector-icons/Ionicons";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, TextInput, View } from "react-native";

import { PickResultNotice } from "@/components/sangyan/feedback";
import { Screen } from "@/components/sangyan/screen";
import {
  AppButton,
  AppText,
  Card,
  InfoNote,
  SendDisclosure,
  OptionCard,
  TextLink,
  type IconName,
} from "@/components/sangyan/ui";
import { Colors, Layout, Radius, Space, Typography } from "@/constants/design";
import {
  pickImage as pickImageFrom,
  type ImageSource,
  type PickResult,
} from "@/services/image-picker";
import { useScan, type ScanMode } from "@/state/scan-store";

const MIN_TEXT_LENGTH = 10;
// Same limit as the server.
const MAX_TEXT_LENGTH = 20_000;

const SAMPLE_MESSAGES = [
  {
    label: "Stock tip group",
    text: "🚨 INSIDER TIP 🚨 XYZ share will double tomorrow! SEBI approved opportunity. Guaranteed 5X return. Only 15 minutes left, invest now. Join our Telegram group.",
  },
  {
    label: "Fake IPO offer",
    text: "Dear investor, you are selected for a pre-IPO allotment. Pay ₹10,000 on UPI to confirm your seat and share the OTP you receive. Limited slots, hurry!",
  },
  {
    label: "Fake trading app",
    text: "Congratulations! Your profit on our VIP trading account is ₹2,40,000. Pay 10% withdrawal tax to withdraw today. Download our trading app from this link: bit.ly/vip-trade",
  },
  {
    label: "Normal message",
    text: "Reminder: your mutual fund statement for September is now available in your registered email. No action is needed.",
  },
];

type PickNotice = Exclude<PickResult, { status: "picked" }> & { source: ImageSource };

function ModeToggle({ mode, onChange }: { mode: ScanMode; onChange: (mode: ScanMode) => void }) {
  const options: { value: ScanMode; label: string; icon: IconName }[] = [
    { value: "image", label: "Screenshot", icon: "image-outline" },
    { value: "text", label: "Message", icon: "chatbox-ellipses-outline" },
  ];

  return (
    <View style={styles.toggle} accessibilityRole="tablist">
      {options.map((option) => {
        const active = option.value === mode;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityLabel={`Check a ${option.label.toLowerCase()}`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.toggleOption, active && styles.toggleOptionActive]}
          >
            <Ionicons name={option.icon} size={18} color={active ? Colors.primary : Colors.muted} />
            <AppText variant="label" tone={active ? "primary" : "muted"}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ScanScreen() {
  const router = useRouter();
  const { draft, updateDraft } = useScan();
  const [picking, setPicking] = useState<ImageSource | null>(null);
  const [notice, setNotice] = useState<PickNotice | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setSubmitting(false);
    }, [])
  );

  const pickImage = async (source: ImageSource) => {
    if (picking) return;
    setNotice(null);
    setPicking(source);
    const picked = await pickImageFrom(source);
    setPicking(null);
    if (picked.status === "picked") {
      updateDraft({
        imageUri: picked.image.uri,
        imageName: picked.image.name,
        imageType: picked.image.type,
        captureSource: "scan",
      });
    } else {
      setNotice({ ...picked, source });
    }
  };

  const textLength = draft.text.trim().length;
  const canSubmit = draft.mode === "image" ? !!draft.imageUri : textLength >= MIN_TEXT_LENGTH;
  const blockedReason =
    draft.mode === "image"
      ? "Choose a screenshot to continue."
      : `Type or paste at least ${MIN_TEXT_LENGTH} characters to continue.`;

  const submit = () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    router.push("/analyzing");
  };

  const footer = (
    <>
      {!canSubmit && (
        <AppText variant="caption" tone="muted" align="center">
          {blockedReason}
        </AppText>
      )}
      <AppButton
        label="Check for scam signs"
        icon="shield-checkmark-outline"
        disabled={!canSubmit}
        loading={submitting}
        loadingLabel="Starting check…"
        onPress={submit}
      />
    </>
  );

  return (
    <Screen keyboard footer={footer}>
      <View style={styles.section}>
        <AppText tone="muted">
          What would you like to check? We will look for common scam warning signs.
        </AppText>
        <ModeToggle
          mode={draft.mode}
          onChange={(mode) => {
            setNotice(null);
            updateDraft({ mode });
          }}
        />
      </View>

      {draft.mode === "image" ? (
        draft.imageUri ? (
          <Card style={styles.section}>
            <Image
              source={{ uri: draft.imageUri }}
              style={styles.previewImage}
              resizeMode="contain"
              accessibilityLabel="Selected screenshot"
            />
            <View style={styles.previewFooter}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <AppText variant="label" style={styles.flex} numberOfLines={1}>
                Ready to check · {draft.imageName}
              </AppText>
            </View>
            <View style={styles.row}>
              <AppButton
                label="Change"
                icon="swap-horizontal"
                variant="secondary"
                compact
                loading={picking === "library"}
                disabled={!!picking}
                onPress={() => pickImage("library")}
                style={styles.flex}
              />
              <AppButton
                label="Remove"
                icon="trash-outline"
                variant="secondary"
                compact
                disabled={!!picking}
                onPress={() => updateDraft({ imageUri: null })}
                style={styles.flex}
              />
            </View>
          </Card>
        ) : (
          <View style={styles.section}>
            <OptionCard
              icon="images"
              title="Choose a screenshot"
              description="From WhatsApp, Telegram, SMS, YouTube, or an ad"
              loading={picking === "library"}
              disabled={!!picking}
              onPress={() => pickImage("library")}
            />
            <OptionCard
              icon="camera"
              title="Take a photo"
              description="Photograph a poster, ad, or another screen"
              iconBackground={Colors.primary}
              loading={picking === "camera"}
              disabled={!!picking}
              onPress={() => pickImage("camera")}
            />
          </View>
        )
      ) : (
        <View style={styles.section}>
          <AppText variant="label" tone="ink" nativeID="message-label">
            Message to check
          </AppText>
          <TextInput
            style={styles.textInput}
            multiline
            value={draft.text}
            onChangeText={(text) => updateDraft({ text })}
            maxLength={MAX_TEXT_LENGTH}
            placeholder="Paste or type the message you received…"
            placeholderTextColor={Colors.subtle}
            accessibilityLabel="Message to check"
            accessibilityLabelledBy="message-label"
          />
          <View style={styles.textMeta}>
            <AppText variant="caption" tone="muted" style={styles.flex}>
              {textLength < MIN_TEXT_LENGTH
                ? "Add a little more text for a better check"
                : `${textLength} characters`}
            </AppText>
            {!!draft.text && (
              <TextLink label="Clear" icon="close-circle-outline" onPress={() => updateDraft({ text: "" })} />
            )}
          </View>
          <AppText variant="overline" tone="muted">
            Try an example
          </AppText>
          <View style={styles.samples}>
            {SAMPLE_MESSAGES.map((sample) => (
              <Pressable
                key={sample.label}
                onPress={() => updateDraft({ text: sample.text })}
                accessibilityRole="button"
                accessibilityLabel={`Use example: ${sample.label}`}
                style={({ pressed }) => [styles.sampleChip, pressed && { backgroundColor: Colors.surfaceMuted }]}
              >
                <AppText variant="label" tone="primary">
                  {sample.label}
                </AppText>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      {notice && <PickResultNotice result={notice} onRetry={pickImage} />}

      {draft.mode === "image" && (
        <InfoNote icon="eye-outline">
          Hide bank details and OTPs before sharing a screenshot.
        </InfoNote>
      )}
      <SendDisclosure kind={draft.mode} action="Check for scam signs" />
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
  toggle: {
    flexDirection: "row",
    backgroundColor: Colors.surfaceMuted,
    borderRadius: Radius.md,
    padding: Space.xs,
  },
  toggleOption: {
    flex: 1,
    minHeight: Layout.minTouch,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
    borderRadius: Radius.sm,
  },
  toggleOptionActive: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  previewImage: {
    width: "100%",
    height: 320,
    borderRadius: Radius.md,
    backgroundColor: Colors.background,
  },
  previewFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  textInput: {
    ...Typography.body,
    fontSize: 16,
    minHeight: 180,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
    padding: Space.lg,
    color: Colors.ink,
    textAlignVertical: "top",
  },
  textMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  samples: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: Space.sm,
  },
  sampleChip: {
    minHeight: 44,
    justifyContent: "center",
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.lg,
  },
});

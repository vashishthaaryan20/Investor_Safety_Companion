import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Card } from "@/components/sangyan/ui";
import { Palette, Radius } from "@/constants/palette";
import { pickImage as pickImageFrom, type ImageSource } from "@/services/image-picker";
import { useScan, type ScanMode } from "@/state/scan-store";

const MIN_TEXT_LENGTH = 10;

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

function ModeToggle({ mode, onChange }: { mode: ScanMode; onChange: (mode: ScanMode) => void }) {
  const options: { value: ScanMode; label: string; icon: "image-outline" | "chatbox-ellipses-outline" }[] = [
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
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option.value)}
            style={[styles.toggleOption, active && styles.toggleOptionActive]}
          >
            <Ionicons name={option.icon} size={18} color={active ? Palette.navy : Palette.muted} />
            <Text style={[styles.toggleLabel, active && styles.toggleLabelActive]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { draft, updateDraft } = useScan();

  const pickImage = async (source: ImageSource) => {
    const picked = await pickImageFrom(source);
    if (picked.status === "picked") {
      updateDraft({
        imageUri: picked.image.uri,
        imageName: picked.image.name,
        imageType: picked.image.type,
      });
    }
  };

  const canSubmit =
    draft.mode === "image"
      ? !!draft.imageUri
      : draft.text.trim().length >= MIN_TEXT_LENGTH;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          What would you like to check? We will look for common scam warning signs.
        </Text>

        <ModeToggle mode={draft.mode} onChange={(mode) => updateDraft({ mode })} />

        {draft.mode === "image" ? (
          draft.imageUri ? (
            <Card style={styles.previewCard}>
              <Image
                source={{ uri: draft.imageUri }}
                style={styles.previewImage}
                accessibilityLabel="Selected screenshot"
              />
              <View style={styles.previewFooter}>
                <Ionicons name="checkmark-circle" size={20} color={Palette.success} />
                <Text style={styles.previewName} numberOfLines={1}>
                  {draft.imageName}
                </Text>
              </View>
              <View style={styles.previewActions}>
                <AppButton
                  label="Change"
                  icon="swap-horizontal"
                  variant="secondary"
                  onPress={() => pickImage("library")}
                  style={styles.flex}
                />
                <AppButton
                  label="Remove"
                  icon="trash-outline"
                  variant="secondary"
                  onPress={() => updateDraft({ imageUri: null })}
                  style={styles.flex}
                />
              </View>
            </Card>
          ) : (
            <View style={styles.pickArea}>
              <Pressable
                onPress={() => pickImage("library")}
                accessibilityRole="button"
                accessibilityLabel="Choose a screenshot from your gallery"
                style={({ pressed }) => [styles.dropzone, pressed && { opacity: 0.8 }]}
              >
                <View style={styles.dropzoneIcon}>
                  <Ionicons name="images-outline" size={34} color={Palette.brand} />
                </View>
                <Text style={styles.dropzoneTitle}>Choose a screenshot</Text>
                <Text style={styles.dropzoneText}>
                  From WhatsApp, Telegram, SMS, YouTube, or an ad
                </Text>
              </Pressable>
              <AppButton
                label="Take a photo instead"
                icon="camera-outline"
                variant="secondary"
                onPress={() => pickImage("camera")}
              />
            </View>
          )
        ) : (
          <View style={styles.textArea}>
            <TextInput
              style={styles.textInput}
              multiline
              value={draft.text}
              onChangeText={(text) => updateDraft({ text })}
              placeholder="Paste or type the message you received…"
              placeholderTextColor={Palette.subtle}
              accessibilityLabel="Message to check"
            />
            <View style={styles.textMeta}>
              <Text style={styles.textHint}>
                {draft.text.trim().length < MIN_TEXT_LENGTH
                  ? "Add a little more text for a better check"
                  : `${draft.text.trim().length} characters`}
              </Text>
              {!!draft.text && (
                <Pressable onPress={() => updateDraft({ text: "" })} hitSlop={8}>
                  <Text style={styles.clear}>Clear</Text>
                </Pressable>
              )}
            </View>
            <Text style={styles.samplesLabel}>Try an example</Text>
            <View style={styles.samples}>
              {SAMPLE_MESSAGES.map((sample) => (
                <Pressable
                  key={sample.label}
                  onPress={() => updateDraft({ text: sample.text })}
                  style={({ pressed }) => [styles.sampleChip, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.sampleText}>{sample.label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View style={styles.privacy}>
          <Ionicons name="lock-closed-outline" size={18} color={Palette.muted} />
          <Text style={styles.privacyText}>
            Your content is only used for this check. Hide bank details and OTPs before sharing a
            screenshot.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <AppButton
          label="Check for scam signs"
          icon="shield-checkmark-outline"
          disabled={!canSubmit}
          onPress={() => router.push("/analyzing")}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 18,
  },
  flex: {
    flex: 1,
  },
  intro: {
    fontSize: 15,
    lineHeight: 22,
    color: Palette.muted,
  },
  toggle: {
    flexDirection: "row",
    backgroundColor: "#E8ECF3",
    borderRadius: Radius.md,
    padding: 4,
  },
  toggleOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: Radius.sm,
  },
  toggleOptionActive: {
    backgroundColor: Palette.surface,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: "700",
    color: Palette.muted,
  },
  toggleLabelActive: {
    color: Palette.navy,
  },
  pickArea: {
    gap: 12,
  },
  dropzone: {
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#BFDBFE",
    backgroundColor: Palette.brandSoft,
    borderRadius: Radius.lg,
    paddingVertical: 38,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 8,
  },
  dropzoneIcon: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: Palette.surface,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  dropzoneTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: Palette.navy,
  },
  dropzoneText: {
    fontSize: 14,
    color: Palette.muted,
    textAlign: "center",
  },
  previewCard: {
    gap: 12,
  },
  previewImage: {
    width: "100%",
    height: 320,
    resizeMode: "contain",
    borderRadius: Radius.md,
    backgroundColor: Palette.background,
  },
  previewFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  previewName: {
    flex: 1,
    fontSize: 14,
    color: Palette.text,
    fontWeight: "600",
  },
  previewActions: {
    flexDirection: "row",
    gap: 10,
  },
  textArea: {
    gap: 10,
  },
  textInput: {
    minHeight: 180,
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Palette.border,
    padding: 16,
    fontSize: 16,
    lineHeight: 23,
    color: Palette.ink,
    textAlignVertical: "top",
  },
  textMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  textHint: {
    fontSize: 13,
    color: Palette.muted,
  },
  clear: {
    fontSize: 14,
    fontWeight: "700",
    color: Palette.brand,
  },
  samplesLabel: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: "800",
    color: Palette.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  samples: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sampleChip: {
    backgroundColor: Palette.surface,
    borderWidth: 1,
    borderColor: Palette.border,
    borderRadius: Radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sampleText: {
    fontSize: 14,
    fontWeight: "600",
    color: Palette.navy,
  },
  privacy: {
    flexDirection: "row",
    gap: 10,
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

import { Linking, Pressable, ScrollView, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

const STEPS = [
  {
    title: "Pause before you pay",
    body: "Guaranteed returns, insider tips, and countdown timers are classic scam patterns. Do not send money from a chat message.",
  },
  {
    title: "Never share OTP, PIN, or CVV",
    body: "SEBI, NSDL, brokers, and banks will not ask for these on WhatsApp or Telegram. Sharing them can empty an account.",
  },
  {
    title: "Verify the firm, not the screenshot",
    body: "Check the person or company on SEBI's official registers. Lookalike websites and forged 'SEBI approved' stamps are common.",
  },
  {
    title: "Use official grievance routes",
    body: "If money already moved, contact your bank, then file on SCORES and the National Cybercrime reporting portal.",
  },
];

export default function StaySafeScreen() {
  const safeAreaInsets = useSafeAreaInsets();
  const theme = useTheme();
  const bottom = safeAreaInsets.bottom + BottomTabInset + Spacing.three;

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: safeAreaInsets.top + 24,
          paddingBottom: bottom,
        },
      ]}
    >
      <ThemedText type="subtitle">Stay Safe</ThemedText>
      <ThemedText style={styles.lead} themeColor="textSecondary">
        SANGYAN Shield helps you spot warning signs. It never tells you which
        stock to buy, sell, or hold.
      </ThemedText>

      {STEPS.map((step) => (
        <ThemedView key={step.title} type="backgroundElement" style={styles.card}>
          <ThemedText type="smallBold">{step.title}</ThemedText>
          <ThemedText type="small" style={styles.cardBody}>
            {step.body}
          </ThemedText>
        </ThemedView>
      ))}

      <Pressable
        onPress={() => Linking.openURL("https://scores.sebi.gov.in/")}
        style={styles.link}
      >
        <ThemedText type="link">Open SEBI SCORES</ThemedText>
      </Pressable>
      <Pressable
        onPress={() => Linking.openURL("https://www.sebi.gov.in/")}
        style={styles.link}
      >
        <ThemedText type="link">Open SEBI website</ThemedText>
      </Pressable>
      <Pressable
        onPress={() => Linking.openURL("https://cybercrime.gov.in/")}
        style={styles.link}
      >
        <ThemedText type="link">National Cybercrime portal</ThemedText>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: { flex: 1 },
  content: {
    paddingHorizontal: 22,
    gap: 14,
  },
  lead: {
    lineHeight: 22,
    marginBottom: 8,
  },
  card: {
    borderRadius: 14,
    padding: 16,
  },
  cardBody: {
    marginTop: 8,
    lineHeight: 21,
  },
  link: {
    paddingVertical: 6,
  },
});

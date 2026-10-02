import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Card, SectionHeader } from "@/components/sangyan/ui";
import { Palette, Radius } from "@/constants/palette";
import { getRiskCopy } from "@/constants/risk";
import { BottomTabInset } from "@/constants/theme";
import { useScan, type ScanHistoryItem, type ScanMode } from "@/state/scan-store";

const HOW_IT_WORKS = [
  { icon: "image-outline", text: "Share a screenshot or paste a message" },
  { icon: "search-outline", text: "We look for common scam signs" },
  { icon: "list-outline", text: "You get clear steps to stay safe" },
] as const;

const SCAM_SIGNS = [
  { icon: "trending-up", title: "Guaranteed returns", text: "\"Double your money in 7 days\"" },
  { icon: "timer-outline", title: "Pressure to hurry", text: "\"Only 10 slots left, pay now\"" },
  { icon: "key-outline", title: "Asks for OTP", text: "\"Share OTP to confirm your seat\"" },
  { icon: "ribbon-outline", title: "Fake approvals", text: "\"SEBI approved scheme\"" },
] as const;

function timeAgo(timestamp: number) {
  const minutes = Math.floor((Date.now() - timestamp) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const date = new Date(timestamp);
  return `${date.getHours().toString().padStart(2, "0")}:${date
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;
}

function RecentCheck({ item, onPress }: { item: ScanHistoryItem; onPress: () => void }) {
  const risk = getRiskCopy(item.result.risk.level);
  const inconclusive = item.result.status === "inconclusive";

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.recentRow, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.recentDot, { backgroundColor: inconclusive ? Palette.subtle : risk.color }]} />
      <View style={styles.recentBody}>
        <Text style={styles.recentPreview} numberOfLines={1}>
          {item.preview}
        </Text>
        <Text style={styles.recentMeta}>
          {item.mode === "image" ? "Screenshot" : "Message"} · {timeAgo(item.createdAt)}
        </Text>
      </View>
      <Text style={[styles.recentLevel, { color: inconclusive ? Palette.muted : risk.color }]}>
        {inconclusive ? "Unclear" : risk.label}
      </Text>
      <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { history, resetDraft, showResult } = useScan();

  const startScan = (mode: ScanMode) => {
    resetDraft(mode);
    router.push("/scan");
  };

  const openHistory = (item: ScanHistoryItem) => {
    showResult(item);
    router.push(item.result.status === "inconclusive" ? "/inconclusive" : "/result");
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + BottomTabInset + 24 },
      ]}
    >
      <View style={styles.brandRow}>
        <View style={styles.logo}>
          <Ionicons name="shield-checkmark" size={22} color="#FFFFFF" />
        </View>
        <View>
          <Text style={styles.brandName}>SANGYAN Shield</Text>
          <Text style={styles.brandTagline}>Check before you trust. Pause before you pay.</Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Got a suspicious investment message?</Text>
        <Text style={styles.heroText}>
          Check it for common scam warning signs in a few seconds. Free, private, and no stock tips.
        </Text>
        <AppButton
          label="Scan a screenshot"
          icon="scan-outline"
          onPress={() => startScan("image")}
          style={styles.heroPrimary}
        />
        <AppButton
          label="Paste a message"
          icon="chatbox-ellipses-outline"
          variant="secondary"
          onPress={() => startScan("text")}
        />
      </View>

      <View>
        <SectionHeader title="How it works" />
        <View style={styles.steps}>
          {HOW_IT_WORKS.map((step, index) => (
            <Card key={step.text} style={styles.step}>
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{index + 1}</Text>
              </View>
              <Ionicons name={step.icon} size={24} color={Palette.brand} />
              <Text style={styles.stepText}>{step.text}</Text>
            </Card>
          ))}
        </View>
      </View>

      <View>
        <SectionHeader
          title="Recent checks"
          subtitle={history.length ? "Tap a check to see the full result." : undefined}
        />
        {history.length ? (
          <Card style={styles.recentCard}>
            {history.map((item, index) => (
              <View key={item.id}>
                {index > 0 && <View style={styles.divider} />}
                <RecentCheck item={item} onPress={() => openHistory(item)} />
              </View>
            ))}
          </Card>
        ) : (
          <Card style={styles.emptyCard}>
            <Ionicons name="time-outline" size={28} color={Palette.subtle} />
            <Text style={styles.emptyText}>
              No checks yet. Your checks from this session will appear here.
            </Text>
          </Card>
        )}
      </View>

      <View>
        <SectionHeader title="Common scam signs" subtitle="If you see these, stop and verify." />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.signs}
        >
          {SCAM_SIGNS.map((sign) => (
            <Card key={sign.title} style={styles.signCard}>
              <Ionicons name={sign.icon} size={24} color={Palette.danger} />
              <Text style={styles.signTitle}>{sign.title}</Text>
              <Text style={styles.signText}>{sign.text}</Text>
            </Card>
          ))}
        </ScrollView>
      </View>

      <Text style={styles.footer}>
        SANGYAN Shield gives safety information only. It never tells you to buy, sell, or hold any
        investment.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    paddingHorizontal: 20,
    gap: 26,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Palette.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  brandName: {
    fontSize: 20,
    fontWeight: "800",
    color: Palette.ink,
  },
  brandTagline: {
    fontSize: 13,
    color: Palette.muted,
    marginTop: 2,
  },
  hero: {
    backgroundColor: Palette.navy,
    borderRadius: Radius.xl,
    padding: 22,
    gap: 12,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 31,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#CBD5E1",
    marginBottom: 6,
  },
  heroPrimary: {
    marginTop: 4,
  },
  steps: {
    flexDirection: "row",
    gap: 10,
  },
  step: {
    flex: 1,
    padding: 14,
    gap: 10,
  },
  stepNumber: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Palette.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 12,
    fontWeight: "800",
    color: Palette.brand,
  },
  stepText: {
    fontSize: 13,
    lineHeight: 18,
    color: Palette.text,
    fontWeight: "600",
  },
  recentCard: {
    paddingVertical: 6,
  },
  recentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
  },
  recentDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  recentBody: {
    flex: 1,
  },
  recentPreview: {
    fontSize: 15,
    fontWeight: "600",
    color: Palette.ink,
  },
  recentMeta: {
    fontSize: 12,
    color: Palette.muted,
    marginTop: 2,
  },
  recentLevel: {
    fontSize: 13,
    fontWeight: "800",
  },
  divider: {
    height: 1,
    backgroundColor: Palette.border,
  },
  emptyCard: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    color: Palette.muted,
    textAlign: "center",
    lineHeight: 20,
  },
  signs: {
    gap: 12,
    paddingRight: 20,
    paddingBottom: 6,
  },
  signCard: {
    width: 180,
    gap: 8,
  },
  signTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: Palette.ink,
  },
  signText: {
    fontSize: 13,
    lineHeight: 19,
    color: Palette.muted,
  },
  footer: {
    fontSize: 12,
    lineHeight: 18,
    color: Palette.subtle,
    textAlign: "center",
  },
});

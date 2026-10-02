import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, Card, IconBadge, SectionHeader } from "@/components/sangyan/ui";
import { getLearnTopic, LEARN_TOPICS } from "@/constants/learn-content";
import { Palette, Radius } from "@/constants/palette";
import { useScan } from "@/state/scan-store";

export default function LearnTopicScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { resetDraft } = useScan();
  const { topic: topicId } = useLocalSearchParams<{ topic: string }>();
  const topic = getLearnTopic(topicId);

  if (!topic) {
    return <Redirect href="/learn" />;
  }

  const index = LEARN_TOPICS.findIndex((item) => item.id === topic.id);
  const nextTopic = LEARN_TOPICS[(index + 1) % LEARN_TOPICS.length];

  const checkMessage = () => {
    resetDraft("text");
    router.push("/scan");
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: "Learn & Protect" }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <IconBadge icon={topic.icon} color="#FFFFFF" background={Palette.brand} size={52} />
          <Text style={styles.heroTitle} accessibilityRole="header">
            {topic.title}
          </Text>
          <Text style={styles.heroText}>{topic.summary}</Text>
        </View>

        <View>
          <SectionHeader icon="git-commit-outline" title="How it works" />
          <Card style={styles.steps}>
            {topic.howItWorks.map((step, stepIndex) => (
              <View key={step} style={styles.stepRow}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{stepIndex + 1}</Text>
                </View>
                <Text style={styles.bodyText}>{step}</Text>
              </View>
            ))}
          </Card>
        </View>

        <View>
          <SectionHeader icon="warning-outline" title="Warning signs" subtitle="If you see any of these, stop." />
          <Card style={styles.list}>
            {topic.warningSigns.map((sign) => (
              <View key={sign} style={styles.listRow}>
                <Ionicons name="alert-circle" size={20} color={Palette.danger} />
                <Text style={styles.bodyText}>{sign}</Text>
              </View>
            ))}
          </Card>
        </View>

        <View>
          <SectionHeader icon="chatbubble-ellipses-outline" title="Example" />
          <Card style={styles.exampleCard}>
            <Text style={styles.exampleFrom}>{topic.example.from}</Text>
            <View style={styles.bubble}>
              <Text style={styles.bubbleText}>{topic.example.message}</Text>
            </View>
            <View style={styles.noteRow}>
              <Ionicons name="bulb-outline" size={18} color={Palette.caution} />
              <Text style={styles.noteText}>{topic.example.note}</Text>
            </View>
          </Card>
        </View>

        <View>
          <SectionHeader icon="shield-checkmark-outline" title="How to protect yourself" />
          <Card style={styles.list}>
            {topic.protect.map((tip) => (
              <View key={tip} style={styles.listRow}>
                <Ionicons name="checkmark-circle" size={20} color={Palette.success} />
                <Text style={styles.bodyText}>{tip}</Text>
              </View>
            ))}
          </Card>
        </View>

        <Pressable
          onPress={() => router.push("/emergency")}
          accessibilityRole="button"
          style={({ pressed }) => [styles.emergency, pressed && { opacity: 0.85 }]}
        >
          <Ionicons name="medkit-outline" size={22} color={Palette.danger} />
          <Text style={styles.emergencyText}>Already lost money? See emergency steps</Text>
          <Ionicons name="chevron-forward" size={18} color={Palette.danger} />
        </Pressable>

        <Pressable
          onPress={() =>
            router.replace({ pathname: "/learn/[topic]", params: { topic: nextTopic.id } })
          }
          accessibilityRole="link"
          style={({ pressed }) => [styles.next, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.flex}>
            <Text style={styles.nextLabel}>Next topic</Text>
            <Text style={styles.nextTitle}>{nextTopic.title}</Text>
          </View>
          <Ionicons name="arrow-forward" size={20} color={Palette.brand} />
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 14 }]}>
        <AppButton label="Check a suspicious message" icon="scan-outline" onPress={checkMessage} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 28,
    gap: 24,
  },
  flex: {
    flex: 1,
  },
  hero: {
    backgroundColor: Palette.brandSoft,
    borderRadius: Radius.xl,
    padding: 20,
    gap: 10,
  },
  heroTitle: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "800",
    color: Palette.ink,
  },
  heroText: {
    fontSize: 15,
    lineHeight: 22,
    color: Palette.text,
  },
  steps: {
    gap: 14,
  },
  stepRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Palette.brandSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: "800",
    color: Palette.brand,
  },
  bodyText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    color: Palette.text,
  },
  list: {
    gap: 12,
  },
  listRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  exampleCard: {
    gap: 10,
  },
  exampleFrom: {
    fontSize: 12,
    fontWeight: "800",
    color: Palette.muted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  bubble: {
    backgroundColor: "#DCFCE7",
    borderRadius: Radius.md,
    borderTopLeftRadius: 4,
    padding: 12,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
    color: Palette.ink,
  },
  noteRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  noteText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: Palette.text,
    fontWeight: "600",
  },
  emergency: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: Radius.lg,
    backgroundColor: Palette.dangerSoft,
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  emergencyText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: Palette.danger,
  },
  next: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
  },
  nextLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Palette.muted,
  },
  nextTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Palette.ink,
    marginTop: 2,
  },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Palette.background,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
});

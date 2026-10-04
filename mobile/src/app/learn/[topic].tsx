import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import { EmergencyBanner } from "@/components/sangyan/feedback";
import { Screen } from "@/components/sangyan/screen";
import { AppButton, AppText, Card, IconBadge, SectionHeader } from "@/components/sangyan/ui";
import { Colors, Radius, Space } from "@/constants/design";
import { getLearnTopic, LEARN_TOPICS } from "@/constants/learn-content";
import { useScan } from "@/state/scan-store";

export default function LearnTopicScreen() {
  const router = useRouter();
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
    <Screen
      footer={
        <AppButton label="Check a suspicious message" icon="scan-outline" onPress={checkMessage} />
      }
    >
      <View style={styles.hero}>
        <IconBadge icon={topic.icon} color={Colors.inverse} background={Colors.secondary} size={52} />
        <AppText variant="overline" tone="brand">
          Topic {index + 1} of {LEARN_TOPICS.length}
        </AppText>
        <AppText variant="title">{topic.title}</AppText>
        <AppText>{topic.summary}</AppText>
      </View>

      <View>
        <SectionHeader icon="git-commit-outline" title="How it works" />
        <Card style={styles.list}>
          {topic.howItWorks.map((step, stepIndex) => (
            <View key={step} style={styles.row}>
              <View style={styles.stepNumber}>
                <AppText variant="caption" tone="brand" style={styles.bold}>
                  {stepIndex + 1}
                </AppText>
              </View>
              <AppText style={styles.flex}>{step}</AppText>
            </View>
          ))}
        </Card>
      </View>

      <View>
        <SectionHeader icon="warning-outline" title="Warning signs" subtitle="If you see any of these, stop." />
        <Card style={styles.list}>
          {topic.warningSigns.map((sign) => (
            <View key={sign} style={styles.row}>
              <Ionicons name="alert-circle" size={20} color={Colors.critical} />
              <AppText style={styles.flex}>{sign}</AppText>
            </View>
          ))}
        </Card>
      </View>

      <View>
        <SectionHeader icon="chatbubble-ellipses-outline" title="Example" />
        <Card style={styles.list}>
          <AppText variant="overline" tone="muted">
            {topic.example.from}
          </AppText>
          <View style={styles.bubble} accessible accessibilityLabel={`Example message: ${topic.example.message}`}>
            <AppText tone="ink">{topic.example.message}</AppText>
          </View>
          <View style={styles.row}>
            <Ionicons name="bulb-outline" size={18} color={Colors.caution} />
            <AppText variant="caption" style={[styles.flex, styles.semibold]}>
              {topic.example.note}
            </AppText>
          </View>
        </Card>
      </View>

      <View>
        <SectionHeader icon="shield-checkmark-outline" title="How to protect yourself" />
        <Card style={styles.list}>
          {topic.protect.map((tip) => (
            <View key={tip} style={styles.row}>
              <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              <AppText style={styles.flex}>{tip}</AppText>
            </View>
          ))}
        </Card>
      </View>

      <EmergencyBanner onPress={() => router.push("/emergency")} />

      <Pressable
        onPress={() => router.replace({ pathname: "/learn/[topic]", params: { topic: nextTopic.id } })}
        accessibilityRole="button"
        accessibilityLabel={`Next topic: ${nextTopic.title}`}
        style={({ pressed }) => [styles.next, pressed && { backgroundColor: Colors.surfaceMuted }]}
      >
        <View style={styles.flex}>
          <AppText variant="caption" tone="muted" style={styles.semibold}>
            Next topic
          </AppText>
          <AppText variant="subheading" tone="ink">
            {nextTopic.title}
          </AppText>
        </View>
        <Ionicons name="arrow-forward" size={20} color={Colors.secondary} />
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  bold: {
    fontWeight: "800",
  },
  semibold: {
    fontWeight: "600",
  },
  hero: {
    backgroundColor: Colors.secondarySoft,
    borderRadius: Radius.xl,
    padding: Space.xl,
    gap: Space.sm,
  },
  list: {
    gap: Space.md,
  },
  row: {
    flexDirection: "row",
    gap: Space.sm + 2,
    alignItems: "flex-start",
  },
  stepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.secondarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  bubble: {
    backgroundColor: Colors.successSoft,
    borderRadius: Radius.md,
    borderTopLeftRadius: 4,
    padding: Space.md,
  },
  next: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    padding: Space.lg,
    minHeight: 64,
    borderRadius: Radius.lg,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
});

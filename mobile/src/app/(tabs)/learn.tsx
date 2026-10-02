import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, IconBadge, SectionHeader } from "@/components/sangyan/ui";
import { LEARN_TOPICS } from "@/constants/learn-content";
import { Palette, Radius } from "@/constants/palette";
import { BottomTabInset } from "@/constants/theme";

const RULES = [
  {
    icon: "pause-circle-outline",
    title: "Pause before you pay",
    body: "Guaranteed returns, insider tips, and countdown timers are classic scam tricks. Never send money because a chat message told you to.",
  },
  {
    icon: "key-outline",
    title: "Never share OTP, PIN, or CVV",
    body: "SEBI, NSDL, brokers, and banks will never ask for these on WhatsApp, Telegram, or a phone call.",
  },
  {
    icon: "search-outline",
    title: "Verify the firm, not the screenshot",
    body: "Check the adviser or company on SEBI's official website. Fake 'SEBI approved' stamps and look-alike websites are common.",
  },
  {
    icon: "megaphone-outline",
    title: "Report it quickly",
    body: "If money has already gone, call 1930 and your bank first, then report on the cybercrime portal or SEBI SCORES.",
  },
] as const;

const LINKS = [
  { label: "Cyber fraud helpline: 1930", url: "tel:1930", icon: "call-outline" },
  { label: "SEBI helpline: 1800 266 7575", url: "tel:18002667575", icon: "call-outline" },
  { label: "Report on cybercrime.gov.in", url: "https://cybercrime.gov.in/", icon: "shield-outline" },
  { label: "Complain on SEBI SCORES", url: "https://scores.sebi.gov.in/", icon: "document-text-outline" },
  {
    label: "Check SEBI-registered firms",
    url: "https://www.sebi.gov.in/intermediaries.html",
    icon: "search-outline",
  },
  {
    label: "Report fraud calls (Sanchar Saathi)",
    url: "https://sancharsaathi.gov.in/",
    icon: "chatbubble-ellipses-outline",
  },
] as const;

export default function LearnScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + BottomTabInset + 24 },
      ]}
    >
      <View>
        <Text style={styles.title} accessibilityRole="header">
          Learn & Protect
        </Text>
        <Text style={styles.lead}>
          Understand how investment scams work so you can spot them early. SANGYAN Shield never
          tells you which stock to buy, sell, or hold.
        </Text>
      </View>

      <Pressable
        onPress={() => router.push("/emergency")}
        accessibilityRole="button"
        style={({ pressed }) => [styles.emergency, pressed && { opacity: 0.9 }]}
      >
        <IconBadge icon="medkit" color="#FFFFFF" background="rgba(255,255,255,0.18)" size={46} />
        <View style={styles.flex}>
          <Text style={styles.emergencyTitle}>Lost money or shared your OTP?</Text>
          <Text style={styles.emergencyText}>Get step-by-step emergency help now</Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
      </Pressable>

      <View>
        <SectionHeader
          icon="school-outline"
          title="Know the tricks"
          subtitle="Short guides with real examples. Tap a topic to learn more."
        />
        <View style={styles.topics}>
          {LEARN_TOPICS.map((topic) => (
            <Pressable
              key={topic.id}
              onPress={() => router.push({ pathname: "/learn/[topic]", params: { topic: topic.id } })}
              accessibilityRole="link"
              style={({ pressed }) => pressed && { opacity: 0.8 }}
            >
              <Card style={styles.topic}>
                <IconBadge
                  icon={topic.icon}
                  color={Palette.brand}
                  background={Palette.brandSoft}
                  size={44}
                />
                <View style={styles.flex}>
                  <Text style={styles.topicTitle}>{topic.title}</Text>
                  <Text style={styles.topicSummary}>{topic.summary}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
              </Card>
            </Pressable>
          ))}
        </View>
      </View>

      <View>
        <SectionHeader icon="star-outline" title="Golden rules" subtitle="Four habits that protect your money." />
        <View style={styles.rules}>
          {RULES.map((rule) => (
            <Card key={rule.title} style={styles.rule}>
              <IconBadge icon={rule.icon} color={Palette.success} background={Palette.successSoft} size={40} />
              <View style={styles.flex}>
                <Text style={styles.ruleTitle}>{rule.title}</Text>
                <Text style={styles.ruleText}>{rule.body}</Text>
              </View>
            </Card>
          ))}
        </View>
      </View>

      <View>
        <SectionHeader icon="call-outline" title="Official help" subtitle="Government helplines and portals only." />
        <Card style={styles.links}>
          {LINKS.map((link, index) => (
            <Pressable
              key={link.url}
              onPress={() => Linking.openURL(link.url)}
              accessibilityRole="link"
              style={({ pressed }) => [
                styles.linkRow,
                index > 0 && styles.linkDivider,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons name={link.icon} size={22} color={Palette.brand} />
              <Text style={styles.linkText}>{link.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={Palette.subtle} />
            </Pressable>
          ))}
        </Card>
      </View>
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
  flex: {
    flex: 1,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: Palette.ink,
  },
  lead: {
    fontSize: 15,
    lineHeight: 22,
    color: Palette.muted,
    marginTop: 6,
  },
  emergency: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 16,
    borderRadius: Radius.xl,
    backgroundColor: Palette.danger,
  },
  emergencyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  emergencyText: {
    fontSize: 13,
    color: "#FEE2E2",
    marginTop: 2,
  },
  topics: {
    gap: 10,
  },
  topic: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
  },
  topicTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Palette.ink,
  },
  topicSummary: {
    fontSize: 13,
    lineHeight: 19,
    color: Palette.muted,
    marginTop: 2,
  },
  rules: {
    gap: 10,
  },
  rule: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  ruleTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Palette.ink,
  },
  ruleText: {
    fontSize: 14,
    lineHeight: 21,
    color: Palette.text,
    marginTop: 4,
  },
  links: {
    paddingVertical: 4,
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
  },
  linkDivider: {
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  linkText: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: Palette.ink,
  },
});

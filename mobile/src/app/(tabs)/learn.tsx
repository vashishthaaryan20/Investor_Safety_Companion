import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { EmergencyBanner } from "@/components/sangyan/feedback";
import { Screen, ScreenTitle } from "@/components/sangyan/screen";
import { AppText, Card, IconBadge, ListRow, OptionCard, SectionHeader } from "@/components/sangyan/ui";
import { Colors, Space } from "@/constants/design";
import { LEARN_TOPICS } from "@/constants/learn-content";
import { openLink } from "@/utils/open-link";

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

  return (
    <Screen tabs safeTop>
      <ScreenTitle
        title="Learn & Protect"
        subtitle="Understand how investment scams work so you can spot them early. SANGYAN Shield never tells you which stock to buy, sell, or hold."
      />

      <EmergencyBanner onPress={() => router.push("/emergency")} />

      <View>
        <SectionHeader
          icon="school-outline"
          title="Know the tricks"
          subtitle="Short guides with real examples. Tap a topic to learn more."
        />
        <View style={styles.list}>
          {LEARN_TOPICS.map((topic) => (
            <OptionCard
              key={topic.id}
              icon={topic.icon}
              title={topic.title}
              description={topic.summary}
              onPress={() => router.push({ pathname: "/learn/[topic]", params: { topic: topic.id } })}
            />
          ))}
        </View>
      </View>

      <View>
        <SectionHeader icon="star-outline" title="Golden rules" subtitle="Four habits that protect your money." />
        <View style={styles.list}>
          {RULES.map((rule) => (
            <Card key={rule.title} style={styles.rule}>
              <IconBadge icon={rule.icon} color={Colors.success} background={Colors.successSoft} size={40} />
              <View style={styles.flex}>
                <AppText variant="subheading" tone="ink">
                  {rule.title}
                </AppText>
                <AppText variant="caption">{rule.body}</AppText>
              </View>
            </Card>
          ))}
        </View>
      </View>

      <View>
        <SectionHeader icon="call-outline" title="Official help" subtitle="Government helplines and portals only." />
        <Card style={styles.links}>
          {LINKS.map((link, index) => (
            <ListRow
              key={link.url}
              icon={link.icon}
              label={link.label}
              external
              divider={index > 0}
              accessibilityHint={link.url.startsWith("tel:") ? "Starts a phone call" : "Opens the official website"}
              onPress={() => openLink(link.url, link.label)}
            />
          ))}
        </Card>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    gap: Space.sm + 2,
  },
  rule: {
    flexDirection: "row",
    gap: Space.md,
    alignItems: "flex-start",
  },
  links: {
    paddingVertical: Space.xs,
  },
});

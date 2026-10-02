import Ionicons from "@expo/vector-icons/Ionicons";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Card, IconBadge, SectionHeader } from "@/components/sangyan/ui";
import { Palette } from "@/constants/palette";
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
    body: "If money has already gone, call your bank first, then report on the cybercrime portal or SEBI SCORES.",
  },
] as const;

const LINKS = [
  { label: "Call cyber fraud helpline 1930", url: "tel:1930", icon: "call-outline" },
  { label: "Report on cybercrime.gov.in", url: "https://cybercrime.gov.in/", icon: "shield-outline" },
  { label: "Complain on SEBI SCORES", url: "https://scores.sebi.gov.in/", icon: "document-text-outline" },
  { label: "Visit the SEBI website", url: "https://www.sebi.gov.in/", icon: "globe-outline" },
] as const;

export default function StaySafeScreen() {
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
          Stay Safe
        </Text>
        <Text style={styles.lead}>
          Four simple habits that protect your money. SANGYAN Shield never tells you which stock to
          buy, sell, or hold.
        </Text>
      </View>

      {RULES.map((rule) => (
        <Card key={rule.title} style={styles.rule}>
          <IconBadge icon={rule.icon} color={Palette.brand} background={Palette.brandSoft} size={44} />
          <View style={styles.ruleBody}>
            <Text style={styles.ruleTitle}>{rule.title}</Text>
            <Text style={styles.ruleText}>{rule.body}</Text>
          </View>
        </Card>
      ))}

      <View>
        <SectionHeader title="Get help" subtitle="Official helplines and complaint portals." />
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
    gap: 16,
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
    marginBottom: 6,
  },
  rule: {
    flexDirection: "row",
    gap: 14,
    alignItems: "flex-start",
  },
  ruleBody: {
    flex: 1,
    gap: 6,
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

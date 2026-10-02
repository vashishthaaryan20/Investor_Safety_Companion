import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppButton, BulletList, Card, SectionHeader } from "@/components/sangyan/ui";
import { Palette, Radius } from "@/constants/palette";

type IconName = ComponentProps<typeof Ionicons>["name"];

interface EmergencyStep {
  title: string;
  detail: string;
  action?: { label: string; url: string; icon: IconName };
}

interface Situation {
  id: string;
  label: string;
  icon: IconName;
  intro: string;
  steps: EmergencyStep[];
}

const SITUATIONS: Situation[] = [
  {
    id: "money",
    label: "I sent money",
    icon: "cash-outline",
    intro: "Move fast. Reporting within the first few hours gives the best chance of freezing the money.",
    steps: [
      {
        title: "Call 1930 right away",
        detail:
          "The National Cyber Crime Helpline can alert banks to freeze the money before it is moved. Keep your transaction details ready.",
        action: { label: "Call 1930", url: "tel:1930", icon: "call-outline" },
      },
      {
        title: "Call your bank's official number",
        detail:
          "Use the number on your debit card, passbook, or the bank's official app, never one sent by the scammer or found in a random web search. Ask them to block the transaction and raise a dispute. Note the UTR / transaction ID.",
      },
      {
        title: "File a complaint at cybercrime.gov.in",
        detail:
          "Choose 'Report Financial Fraud' and add the payment details. Save the acknowledgement number; your bank and the police will ask for it.",
        action: { label: "Open cybercrime.gov.in", url: "https://cybercrime.gov.in/", icon: "open-outline" },
      },
      {
        title: "Save all evidence",
        detail:
          "Take screenshots of chats, profiles, payment receipts, UPI IDs, phone numbers, and website links. Don't delete the chat or block the number until you have saved everything.",
      },
      {
        title: "Do not pay anything more",
        detail:
          "Scammers often ask for 'tax', 'penalty', or 'release fees' to return your money. That money never comes back. Stop all payments.",
      },
      {
        title: "Visit your nearest police station or cyber cell",
        detail:
          "Carry your acknowledgement number, bank statement, and screenshots. For large amounts, ask them to register an FIR.",
      },
    ],
  },
  {
    id: "details",
    label: "I shared OTP / PIN",
    icon: "key-outline",
    intro: "Lock your accounts before anyone uses the details you shared.",
    steps: [
      {
        title: "Block your cards, UPI, and net banking",
        detail:
          "Call your bank's official number or use its official app to block cards and UPI immediately. Ask them to check for any recent transactions.",
      },
      {
        title: "Change your PINs and passwords",
        detail:
          "Change your UPI PIN, net banking password, email password, and trading app password. Do this from a phone that the scammer has not accessed.",
      },
      {
        title: "Remove screen-sharing apps",
        detail:
          "If someone asked you to install AnyDesk, TeamViewer, QuickSupport, or any other app, uninstall it now. These let them see and control your phone.",
      },
      {
        title: "Secure your trading and demat account",
        detail:
          "Call your broker and ask them to freeze your trading account. SEBI requires brokers to offer this through their app, SMS, or email. Turn on two-factor login.",
      },
      {
        title: "Check your holdings statement",
        detail:
          "Look at your latest Consolidated Account Statement (CAS) from NSDL or CDSL for any shares or funds you didn't move.",
        action: { label: "Open NSDL CAS", url: "https://nsdlcas.nsdl.com/", icon: "open-outline" },
      },
      {
        title: "Lock your Aadhaar biometrics",
        detail:
          "If you shared your Aadhaar number or photos of it, lock your biometrics on the official myAadhaar portal.",
        action: { label: "Open myAadhaar", url: "https://myaadhaar.uidai.gov.in/", icon: "open-outline" },
      },
      {
        title: "Report it, even if no money is lost yet",
        detail: "Call 1930 or file a complaint on cybercrime.gov.in so the fraud is on record.",
        action: { label: "Call 1930", url: "tel:1930", icon: "call-outline" },
      },
    ],
  },
  {
    id: "report",
    label: "Report a scam",
    icon: "megaphone-outline",
    intro: "Reporting protects others too, even if you didn't lose anything.",
    steps: [
      {
        title: "Online or financial fraud",
        detail: "Report any online investment fraud on the National Cyber Crime Reporting Portal.",
        action: { label: "Open cybercrime.gov.in", url: "https://cybercrime.gov.in/", icon: "open-outline" },
      },
      {
        title: "Fraud calls, SMS, or WhatsApp messages",
        detail:
          "Report suspicious calls and messages on the Chakshu facility of the Sanchar Saathi portal, run by the Department of Telecommunications.",
        action: { label: "Open Sanchar Saathi", url: "https://sancharsaathi.gov.in/", icon: "open-outline" },
      },
      {
        title: "Complaint against a SEBI-registered broker or adviser",
        detail:
          "File a complaint on SEBI SCORES. If it isn't resolved, you can take it to the Online Dispute Resolution portal (SMART ODR).",
        action: { label: "Open SEBI SCORES", url: "https://scores.sebi.gov.in/", icon: "open-outline" },
      },
      {
        title: "Not sure where to go?",
        detail: "Call the SEBI toll-free helpline for guidance on investor complaints.",
        action: { label: "Call 1800 266 7575", url: "tel:18002667575", icon: "call-outline" },
      },
    ],
  },
];

const KEEP_READY = [
  "Transaction ID / UTR number and the date and time of payment",
  "The UPI ID, bank account, or wallet you paid to",
  "Scammer's phone numbers, profile names, and group names",
  "Screenshots of chats, ads, and the app or website",
  "Your complaint acknowledgement number",
];

export default function EmergencyScreen() {
  const insets = useSafeAreaInsets();
  const [situationId, setSituationId] = useState(SITUATIONS[0].id);
  const situation = SITUATIONS.find((item) => item.id === situationId) ?? SITUATIONS[0];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.heroTop}>
            <Ionicons name="time-outline" size={22} color="#FFFFFF" />
            <Text style={styles.heroEyebrow}>Act fast</Text>
          </View>
          <Text style={styles.heroTitle} accessibilityRole="header">
            Don&apos;t panic. Follow these steps now.
          </Text>
          <Text style={styles.heroText}>
            Reporting quickly gives you the best chance to stop the money or protect your accounts.
            You are not to blame. Scammers fool careful people every day.
          </Text>
          <AppButton
            label="Call 1930 – Cyber fraud helpline"
            icon="call"
            variant="secondary"
            onPress={() => Linking.openURL("tel:1930")}
          />
        </View>

        <View>
          <SectionHeader title="What happened?" subtitle="Choose your situation to see the right steps." />
          <View style={styles.selector} accessibilityRole="tablist">
            {SITUATIONS.map((item) => {
              const active = item.id === situation.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setSituationId(item.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <Ionicons
                    name={item.icon}
                    size={22}
                    color={active ? "#FFFFFF" : Palette.navy}
                  />
                  <Text style={[styles.optionText, active && styles.optionTextActive]}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.steps}>
          <Text style={styles.intro}>{situation.intro}</Text>
          {situation.steps.map(({ title, detail, action }, index) => (
            <Card key={title} style={styles.stepCard}>
              <View style={styles.stepHeader}>
                <View style={styles.stepNumber}>
                  <Text style={styles.stepNumberText}>{index + 1}</Text>
                </View>
                <Text style={styles.stepTitle}>{title}</Text>
              </View>
              <Text style={styles.stepDetail}>{detail}</Text>
              {action && (
                <Pressable
                  onPress={() => Linking.openURL(action.url)}
                  accessibilityRole="link"
                  style={({ pressed }) => [styles.stepAction, pressed && { opacity: 0.75 }]}
                >
                  <Ionicons name={action.icon} size={18} color={Palette.brand} />
                  <Text style={styles.stepActionText}>{action.label}</Text>
                </Pressable>
              )}
            </Card>
          ))}
        </View>

        <View>
          <SectionHeader icon="folder-open-outline" title="Keep these details ready" />
          <Card>
            <BulletList items={KEEP_READY} color={Palette.navy} />
          </Card>
        </View>

        <Card style={styles.warning}>
          <View style={styles.warningHeader}>
            <Ionicons name="warning-outline" size={22} color={Palette.warning} />
            <Text style={styles.warningTitle}>Beware of &quot;recovery&quot; scams</Text>
          </View>
          <Text style={styles.warningText}>
            After a fraud, people who promise to get your money back for a fee are usually
            scammers too. Police, banks, and SEBI never charge you to file or follow up on a
            complaint, and never ask for your OTP.
          </Text>
        </Card>

        <Text style={styles.disclaimer}>
          These steps are general safety guidance, not legal advice. Always use official phone
          numbers and websites.
        </Text>
      </ScrollView>
      <View style={{ height: insets.bottom }} />
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
  hero: {
    backgroundColor: Palette.danger,
    borderRadius: Radius.xl,
    padding: 20,
    gap: 12,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  heroEyebrow: {
    fontSize: 13,
    fontWeight: "800",
    color: "#FFFFFF",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  heroTitle: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  heroText: {
    fontSize: 15,
    lineHeight: 22,
    color: "#FEE2E2",
    marginBottom: 4,
  },
  selector: {
    flexDirection: "row",
    gap: 8,
  },
  option: {
    flex: 1,
    alignItems: "center",
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Palette.border,
    backgroundColor: Palette.surface,
  },
  optionActive: {
    backgroundColor: Palette.navy,
    borderColor: Palette.navy,
  },
  optionText: {
    fontSize: 13,
    fontWeight: "700",
    color: Palette.navy,
    textAlign: "center",
  },
  optionTextActive: {
    color: "#FFFFFF",
  },
  steps: {
    gap: 12,
  },
  intro: {
    fontSize: 15,
    lineHeight: 22,
    color: Palette.text,
    fontWeight: "600",
  },
  stepCard: {
    gap: 10,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Palette.dangerSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumberText: {
    fontSize: 14,
    fontWeight: "800",
    color: Palette.danger,
  },
  stepTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "800",
    color: Palette.ink,
  },
  stepDetail: {
    fontSize: 15,
    lineHeight: 22,
    color: Palette.text,
  },
  stepAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: Radius.md,
    backgroundColor: Palette.brandSoft,
  },
  stepActionText: {
    fontSize: 14,
    fontWeight: "700",
    color: Palette.brand,
  },
  warning: {
    gap: 8,
    backgroundColor: Palette.warningSoft,
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Palette.warning,
  },
  warningText: {
    fontSize: 14,
    lineHeight: 21,
    color: Palette.text,
  },
  disclaimer: {
    fontSize: 12,
    lineHeight: 18,
    color: Palette.subtle,
    textAlign: "center",
  },
});

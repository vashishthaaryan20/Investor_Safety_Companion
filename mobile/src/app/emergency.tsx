import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View } from "react-native";

import { InlineAlert } from "@/components/sangyan/feedback";
import { Screen } from "@/components/sangyan/screen";
import {
  AppButton,
  AppText,
  BulletList,
  Card,
  SectionHeader,
  type IconName,
} from "@/components/sangyan/ui";
import { Colors, Gradients, Layout, Radius, Space } from "@/constants/design";
import { openLink } from "@/utils/open-link";

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
  const { width, fontScale } = useWindowDimensions();
  const [situationId, setSituationId] = useState(SITUATIONS[0].id);
  const situation = SITUATIONS.find((item) => item.id === situationId) ?? SITUATIONS[0];
  const stackOptions = width < 360 || fontScale > 1.3;

  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Ionicons name="time-outline" size={22} color={Colors.inverse} />
          <AppText variant="overline" tone="inverse">
            Act fast
          </AppText>
        </View>
        <AppText variant="title" tone="inverse" accessibilityRole="header">
          Don&apos;t panic. Follow these steps now.
        </AppText>
        <AppText tone="inverse" style={styles.heroText}>
          Reporting quickly gives you the best chance to stop the money or protect your accounts.
          You are not to blame. Scammers fool careful people every day.
        </AppText>
        <AppButton
          label="Call 1930 – Cyber fraud helpline"
          icon="call"
          variant="inverse"
          accessibilityHint="Starts a phone call to the national cyber fraud helpline"
          onPress={() => openLink("tel:1930", "Cyber fraud helpline")}
        />
      </View>

      <View>
        <SectionHeader title="What happened?" subtitle="Choose your situation to see the right steps." />
        <View style={[styles.selector, stackOptions && styles.selectorStacked]} accessibilityRole="tablist">
          {SITUATIONS.map((item) => {
            const active = item.id === situation.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setSituationId(item.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={[
                  styles.option,
                  stackOptions && styles.optionStacked,
                  active && styles.optionActive,
                ]}
              >
                <Ionicons name={item.icon} size={22} color={active ? Colors.inverse : Colors.accent} />
                <AppText
                  variant="label"
                  tone={active ? "inverse" : "primary"}
                  align={stackOptions ? "left" : "center"}
                >
                  {item.label}
                </AppText>
                {active && stackOptions && (
                  <Ionicons name="checkmark" size={20} color={Colors.inverse} style={styles.optionCheck} />
                )}
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.steps}>
        <AppText variant="bodyStrong" accessibilityLiveRegion="polite">
          {situation.intro}
        </AppText>
        {situation.steps.map(({ title, detail, action }, index) => (
          <Card key={title} style={styles.stepCard}>
            <View style={styles.stepHeader}>
              <View style={styles.stepNumber}>
                <AppText variant="label" tone="critical">
                  {index + 1}
                </AppText>
              </View>
              <AppText variant="subheading" tone="ink" style={styles.flex} accessibilityRole="header">
                {title}
              </AppText>
            </View>
            <AppText>{detail}</AppText>
            {action && (
              <AppButton
                label={action.label}
                icon={action.icon}
                variant="secondary"
                compact
                accessibilityHint={action.url.startsWith("tel:") ? "Starts a phone call" : "Opens the official website"}
                onPress={() => openLink(action.url, action.label)}
                style={styles.stepAction}
              />
            )}
          </Card>
        ))}
      </View>

      <View>
        <SectionHeader icon="folder-open-outline" title="Keep these details ready" />
        <Card>
          <BulletList items={KEEP_READY} color={Colors.accent} />
        </Card>
      </View>

      <InlineAlert
        tone="warning"
        icon="warning-outline"
        title="Beware of “recovery” scams"
        message="After a fraud, people who promise to get your money back for a fee are usually scammers too. Police, banks, and SEBI never charge you to file or follow up on a complaint, and never ask for your OTP."
      />

      <AppText variant="caption" tone="muted" align="center">
        These steps are general safety guidance, not legal advice. Always use official phone
        numbers and websites.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  hero: {
    backgroundColor: Colors.dangerPanel,
    experimental_backgroundImage: Gradients.danger,
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.criticalBorder,
    padding: Space.xl,
    gap: Space.md,
  },
  heroTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  heroText: {
    marginBottom: Space.xs,
  },
  selector: {
    flexDirection: "row",
    gap: Space.sm,
  },
  selectorStacked: {
    flexDirection: "column",
  },
  option: {
    flex: 1,
    alignItems: "center",
    gap: Space.xs + 2,
    minHeight: Layout.minTouch,
    paddingVertical: Space.md + 2,
    paddingHorizontal: Space.xs + 2,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  optionStacked: {
    flexDirection: "row",
    paddingHorizontal: Space.lg,
    gap: Space.md,
  },
  optionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  optionCheck: {
    marginLeft: "auto",
  },
  steps: {
    gap: Space.md,
  },
  stepCard: {
    gap: Space.sm + 2,
  },
  stepHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: Colors.criticalSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  stepAction: {
    alignSelf: "flex-start",
  },
});

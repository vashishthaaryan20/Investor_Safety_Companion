import type { ComponentProps } from "react";
import type Ionicons from "@expo/vector-icons/Ionicons";

type IconName = ComponentProps<typeof Ionicons>["name"];

export type LearnTopicId =
  | "common-scams"
  | "fake-trading-platforms"
  | "ponzi-pyramid"
  | "fake-sebi-registration"
  | "phishing-impersonation"
  | "safe-investing";

export interface LearnTopic {
  id: LearnTopicId;
  title: string;
  icon: IconName;
  summary: string;
  howItWorks: string[];
  warningSigns: string[];
  example: { from: string; message: string; note: string };
  protect: string[];
}

export const LEARN_TOPICS: LearnTopic[] = [
  {
    id: "common-scams",
    title: "Common investment scams",
    icon: "alert-circle-outline",
    summary: "Stock tip groups, fake IPO offers, and 'guaranteed return' schemes.",
    howItWorks: [
      "A stranger adds you to a WhatsApp or Telegram group, or messages you directly, claiming to be a market expert.",
      "They share a few 'tips' that seem to work, or post screenshots of big profits from other members, to build trust.",
      "Then they offer a special deal: a guaranteed-return plan, a pre-IPO allotment, or a 'premium' tip service that needs payment.",
      "Once you pay, they ask for more money, stop replying, or the group disappears.",
    ],
    warningSigns: [
      "Promises of fixed, guaranteed, or very high returns",
      "Pressure to decide quickly: 'only 10 slots left', 'offer ends today'",
      "Tips from strangers in chat groups or social media",
      "Payment asked to a personal UPI ID, wallet, or crypto",
      "Screenshots of other people's profits used as proof",
    ],
    example: {
      from: "Unknown number on WhatsApp",
      message:
        "Join our VIP group for 100% sure-shot intraday tips. Guaranteed 30% monthly profit. Only 5 seats left, pay ₹4,999 now.",
      note: "Guaranteed profit, urgency, and payment to an unknown person: three warning signs together.",
    },
    protect: [
      "Remember: no genuine investment can guarantee returns.",
      "Never invest based on tips from strangers or chat groups.",
      "Take your time. A real opportunity will still be there tomorrow.",
      "Talk to a family member or someone you trust before paying.",
    ],
  },
  {
    id: "fake-trading-platforms",
    title: "How fake trading platforms work",
    icon: "phone-portrait-outline",
    summary: "Look-alike apps that show fake profits and block withdrawals.",
    howItWorks: [
      "Scammers share a link to a trading app or website that looks professional, often through a tip group.",
      "You deposit a small amount, and the app shows big profits. You may even be allowed one small withdrawal to build trust.",
      "Encouraged, you invest more. The 'profits' are just numbers on a screen. Your money never reaches the stock market.",
      "When you try to withdraw, you are asked to pay 'tax', 'service fee', or 'unlock charges'. After you pay, the account is frozen or the app vanishes.",
    ],
    warningSigns: [
      "App downloaded from a link instead of the Play Store or App Store",
      "Offers of 'institutional', 'VIP', 'QIB', or 'OTC' accounts with special access",
      "Deposits go to a personal bank account or random UPI ID",
      "Withdrawal blocked until you pay tax or a fee",
      "The broker's name is not on SEBI's list of registered stock brokers",
    ],
    example: {
      from: "Trading app support chat",
      message:
        "Your profit is ₹2,40,000. To withdraw, please pay 15% income tax in advance to our account. Withdrawal will be processed in 24 hours.",
      note: "Real brokers never ask you to pay before releasing your own money. Tax is never collected this way.",
    },
    protect: [
      "Only trade through SEBI-registered brokers, using their official apps from the Play Store or App Store.",
      "Check the broker on SEBI's registered intermediaries list before depositing anything.",
      "Your money should go to the broker's own account. SEBI-registered firms now use verified UPI IDs that contain '@valid'.",
      "Never pay a fee to withdraw. If asked, stop and report it.",
    ],
  },
  {
    id: "ponzi-pyramid",
    title: "Ponzi and pyramid schemes",
    icon: "git-network-outline",
    summary: "Schemes that pay old members with new members' money.",
    howItWorks: [
      "A Ponzi scheme promises high, regular returns. Early investors are paid using money from newer investors, not real profits.",
      "A pyramid scheme pays you mainly for recruiting others: joining bonus, referral income, or 'level income'.",
      "Both need a constant flow of new money. When joining slows down, payments stop.",
      "Most people, especially those who join later, lose all their money. Promoters may also face legal action.",
    ],
    warningSigns: [
      "Steady high returns every month regardless of market conditions",
      "Income from adding members: 'refer 5 people and earn'",
      "Complicated 'binary', 'chain', or 'level' plans",
      "Pressure to bring in friends and family",
      "No clear explanation of how the money is actually invested",
    ],
    example: {
      from: "Friend's forwarded message",
      message:
        "Invest ₹10,000 and get ₹1,500 every month! Add 3 members and get ₹2,000 joining bonus for each. Level income up to 10 levels.",
      note: "Returns that depend on recruiting others are the core of a pyramid scheme.",
    },
    protect: [
      "Ask: where exactly does the profit come from? If the answer is 'new members', walk away.",
      "Don't recruit friends or family into any scheme you can't verify.",
      "Unregulated deposit schemes are banned in India. Check before you join.",
      "Report such schemes to the police or on cybercrime.gov.in.",
    ],
  },
  {
    id: "fake-sebi-registration",
    title: "Fake SEBI registration claims",
    icon: "ribbon-outline",
    summary: "Fake 'SEBI approved' stamps and copied registration numbers.",
    howItWorks: [
      "Scammers add 'SEBI approved', 'SEBI registered', or government logos to look trustworthy.",
      "Some copy the registration number of a real adviser, or make one up that looks right.",
      "They may send fake certificates or ID cards to convince you.",
      "In reality, SEBI registers advisers and brokers, but never approves or guarantees any scheme's returns.",
    ],
    warningSigns: [
      "Claims like 'SEBI approved scheme' or 'government guaranteed returns'",
      "Paid stock tips from someone who shows no SEBI registration number",
      "Registration number given, but the name or contact details don't match SEBI's records",
      "Payment requested to a personal account instead of the registered firm's account",
    ],
    example: {
      from: "Telegram channel",
      message:
        "SEBI registered research analyst. 100% accurate calls. Pay ₹2,999 to my personal UPI for 1 month premium membership.",
      note: "Registered analysts can't promise accuracy, and payments should go to the registered entity, not a personal account.",
    },
    protect: [
      "Search the name and registration number on SEBI's official registered intermediaries list (sebi.gov.in).",
      "Investment advisers have numbers starting with INA; research analysts start with INH.",
      "Check that the phone number, email, and website match what SEBI has on record.",
      "Pay only through verified channels. Look for UPI IDs containing '@valid' for SEBI-registered firms.",
    ],
  },
  {
    id: "phishing-impersonation",
    title: "Phishing and impersonation",
    icon: "fish-outline",
    summary: "Fake links, callers pretending to be SEBI, banks, or brokers.",
    howItWorks: [
      "You get a call, SMS, or email from someone pretending to be from your bank, broker, SEBI, NSDL, or the police.",
      "They create panic, such as 'your demat account will be blocked' or 'KYC expired', or offer a reward.",
      "They send a link to a fake website that looks real, or ask you to install a screen-sharing app.",
      "When you enter your details or share the OTP, they take control of your account and move money or shares.",
    ],
    warningSigns: [
      "Requests for OTP, UPI PIN, CVV, or passwords",
      "Links with odd spellings or short links (bit.ly, tinyurl)",
      "Threats of account blocking or legal action",
      "Requests to install AnyDesk, TeamViewer, or other remote apps",
      "Caller ID or WhatsApp profile showing an official logo",
    ],
    example: {
      from: "SMS from 'NSDL-KYC'",
      message:
        "Your demat account will be suspended today. Update KYC immediately: http://nsdl-kyc-update.co. Share OTP to verify.",
      note: "NSDL and SEBI never ask for OTPs or send KYC links like this.",
    },
    protect: [
      "Never share OTP, PIN, CVV, or passwords with anyone, even if they claim to be an official.",
      "Don't click links in messages. Type the official website address yourself.",
      "Hang up and call back using the number on your card, passbook, or official app.",
      "Report fraud calls and messages on the Chakshu portal at sancharsaathi.gov.in.",
    ],
  },
  {
    id: "safe-investing",
    title: "Safe investing practices",
    icon: "shield-checkmark-outline",
    summary: "Simple habits that keep your money protected.",
    howItWorks: [
      "Safe investing starts with knowing who you are dealing with. Use only SEBI-registered brokers, advisers, and mutual funds.",
      "Keep your demat and bank accounts in your own control. Turn on two-factor login and never share credentials.",
      "Check your Consolidated Account Statement (CAS) from NSDL or CDSL every month for anything unusual.",
      "Understand that all market investments carry risk. Higher promised returns usually mean higher risk, or a scam.",
    ],
    warningSigns: [
      "You don't understand where your money is going",
      "Someone else is operating your trading account",
      "You are asked to keep the investment secret from family",
      "You are paying to someone other than a registered firm",
    ],
    example: {
      from: "Good practice",
      message:
        "Before investing, I checked the broker on SEBI's website, downloaded their app from the Play Store, and paid only to their verified UPI ID.",
      note: "A few minutes of checking can prevent a big loss.",
    },
    protect: [
      "Verify every broker or adviser on sebi.gov.in before paying.",
      "Use official apps from the Play Store or App Store only.",
      "Review your CAS and bank statements regularly.",
      "When in doubt, call the SEBI helpline: 1800 266 7575 (toll-free).",
    ],
  },
];

export function getLearnTopic(id: string | undefined): LearnTopic | undefined {
  return LEARN_TOPICS.find((topic) => topic.id === id);
}

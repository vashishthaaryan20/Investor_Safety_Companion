/**
 * SANGYAN Shield design tokens. Every screen and shared component should take its
 * colours, type, spacing, and shapes from here.
 *
 * Text colours below are chosen to meet WCAG AA (4.5:1) on `background` and `surface`.
 * `subtle` is for icons, dividers, and placeholders only — never for body text.
 */
import { Platform, type TextStyle } from "react-native";

export const Colors = {
  // Brand
  primary: "#0B2545",
  primaryPressed: "#13315C",
  primarySoft: "#E8EDF5",
  secondary: "#0F766E",
  secondaryPressed: "#0B5E58",
  secondarySoft: "#E6F4F1",

  // Surfaces
  background: "#F6F8FB",
  surface: "#FFFFFF",
  surfaceMuted: "#EEF2F7",
  border: "#DDE3EA",
  borderStrong: "#C5CED9",
  overlay: "rgba(11,37,69,0.06)",

  // Text
  ink: "#0F172A",
  text: "#1F2937",
  muted: "#55606E",
  subtle: "#8A94A3",
  inverse: "#FFFFFF",
  inverseMuted: "#CBD5E1",

  // Meaning
  success: "#15803D",
  successSoft: "#ECFDF3",
  successBorder: "#BBF7D0",
  caution: "#A16207",
  cautionSoft: "#FEFCE8",
  cautionBorder: "#FDE68A",
  warning: "#C2410C",
  warningSoft: "#FFF7ED",
  warningBorder: "#FED7AA",
  critical: "#B91C1C",
  criticalSoft: "#FEF2F2",
  criticalBorder: "#FECACA",
  info: "#1D4ED8",
  infoSoft: "#EFF6FF",
  infoBorder: "#BFDBFE",

  highlight: "#FDE68A",
  disabledBackground: "#E5E9EF",
  disabledText: "#6B7280",
} as const;

export type Tone = "neutral" | "info" | "success" | "caution" | "warning" | "critical" | "brand";

export const ToneColors: Record<Tone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: Colors.muted, bg: Colors.surfaceMuted, border: Colors.border },
  info: { fg: Colors.info, bg: Colors.infoSoft, border: Colors.infoBorder },
  success: { fg: Colors.success, bg: Colors.successSoft, border: Colors.successBorder },
  caution: { fg: Colors.caution, bg: Colors.cautionSoft, border: Colors.cautionBorder },
  warning: { fg: Colors.warning, bg: Colors.warningSoft, border: Colors.warningBorder },
  critical: { fg: Colors.critical, bg: Colors.criticalSoft, border: Colors.criticalBorder },
  brand: { fg: Colors.secondary, bg: Colors.secondarySoft, border: "#B7E0D9" },
};

export const Typography = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "800" },
  title: { fontSize: 24, lineHeight: 30, fontWeight: "800" },
  heading: { fontSize: 19, lineHeight: 25, fontWeight: "800" },
  subheading: { fontSize: 16, lineHeight: 22, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 22, fontWeight: "400" },
  bodyStrong: { fontSize: 15, lineHeight: 22, fontWeight: "700" },
  label: { fontSize: 14, lineHeight: 20, fontWeight: "700" },
  caption: { fontSize: 13, lineHeight: 19, fontWeight: "400" },
  overline: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  mono: {
    fontSize: 13,
    lineHeight: 19,
    fontFamily: Platform.select({ ios: "Menlo", default: "monospace" }),
  },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof Typography;

export const Space = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 22,
  pill: 999,
} as const;

export const Elevation = {
  card: {
    shadowColor: Colors.primary,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
} as const;

export const Layout = {
  /** Horizontal padding for every screen. */
  screenPadding: Space.xl,
  /** Gap between top-level sections on a screen. */
  sectionGap: Space.xxl,
  /** Content stays readable on tablets and foldables. */
  maxContentWidth: 680,
  cardPadding: Space.lg,
  /** Android's recommended minimum touch target. */
  minTouch: 48,
  buttonHeight: 52,
  /** Space the native tab bar covers at the bottom of tab screens. */
  tabBarInset: Platform.select({ ios: 50, android: 80 }) ?? 0,
} as const;

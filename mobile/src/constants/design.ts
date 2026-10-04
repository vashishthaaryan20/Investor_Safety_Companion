/**
 * SANGYAN Shield design tokens. Every screen and shared component should take its
 * colours, type, spacing, and shapes from here.
 *
 * ── Change the app's look here ─────────────────────────────────────────────────────────
 * The whole theme (dark "cyber" style: near-black background, teal/green-to-blue glow,
 * glassy cards, cyan accents) comes from `Colors` and `Gradients` below. Edit a value and
 * every screen follows. Tips:
 *   - `primary` is a BACKGROUND colour (buttons, hero cards) with white text on top, so
 *     keep it dark enough for white text. `accent` is the bright FOREGROUND colour for
 *     links, icons and selected tabs on dark surfaces.
 *   - `...Soft` and `...Border` colours are see-through so cards keep the glassy look.
 *   - Text colours meet WCAG AA (4.5:1) on `background` and `surface`; re-check contrast
 *     if you change them. `subtle` is for icons, dividers and placeholders only.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */
import { Platform, type TextStyle } from "react-native";

export const Colors = {
  // Brand
  primary: "#0B5F66",
  primaryPressed: "#0E7480",
  primarySoft: "rgba(79,216,242,0.12)",
  accent: "#4FD8F2",
  secondary: "#10A394",
  secondaryPressed: "#0C8578",
  secondarySoft: "rgba(16,163,148,0.18)",

  // Surfaces
  background: "#05090C",
  /** Top of the screen glow; also the header and status bar colour. */
  backgroundTop: "#07302B",
  surface: "#0E161B",
  surfaceMuted: "#16222A",
  glass: "rgba(5,9,12,0.55)",
  border: "rgba(255,255,255,0.09)",
  borderStrong: "rgba(255,255,255,0.2)",
  overlay: "rgba(79,216,242,0.1)",

  // Text
  ink: "#F4FAFC",
  text: "#DCE6EB",
  muted: "#9AABB5",
  subtle: "#5E6E78",
  inverse: "#FFFFFF",
  inverseMuted: "#CDE3E6",

  // Meaning
  success: "#34D399",
  successSoft: "rgba(52,211,153,0.12)",
  successBorder: "rgba(52,211,153,0.4)",
  caution: "#FACC15",
  cautionSoft: "rgba(250,204,21,0.1)",
  cautionBorder: "rgba(250,204,21,0.4)",
  warning: "#FB923C",
  warningSoft: "rgba(251,146,60,0.12)",
  warningBorder: "rgba(251,146,60,0.42)",
  critical: "#F87171",
  criticalSoft: "rgba(248,113,113,0.13)",
  criticalBorder: "rgba(248,113,113,0.45)",
  /** Dark red panel behind white text (emergency help). */
  dangerPanel: "#991B1B",
  info: "#60A5FA",
  infoSoft: "rgba(96,165,250,0.12)",
  infoBorder: "rgba(96,165,250,0.4)",

  highlight: "#FDE68A",
  disabledBackground: "#1C272E",
  disabledText: "#7B8B95",
} as const;

/** CSS-style gradients for `experimental_backgroundImage`; `backgroundColor` is the fallback. */
export const Gradients = {
  /** Behind every screen: a teal glow at the top fading into the background. */
  screen: `linear-gradient(180deg, ${Colors.backgroundTop} 0%, #061A1C 22%, ${Colors.background} 48%)`,
  /** Hero cards and highlighted panels: green to blue. */
  hero: "linear-gradient(135deg, #0E7C6B 0%, #0B5F78 55%, #0A2F52 100%)",
  /** Emergency help panel. */
  danger: "linear-gradient(135deg, #B91C1C 0%, #7F1D1D 60%, #3B0A12 100%)",
} as const;

export type Tone = "neutral" | "info" | "success" | "caution" | "warning" | "critical" | "brand";

export const ToneColors: Record<Tone, { fg: string; bg: string; border: string }> = {
  neutral: { fg: Colors.muted, bg: Colors.surfaceMuted, border: Colors.border },
  info: { fg: Colors.info, bg: Colors.infoSoft, border: Colors.infoBorder },
  success: { fg: Colors.success, bg: Colors.successSoft, border: Colors.successBorder },
  caution: { fg: Colors.caution, bg: Colors.cautionSoft, border: Colors.cautionBorder },
  warning: { fg: Colors.warning, bg: Colors.warningSoft, border: Colors.warningBorder },
  critical: { fg: Colors.critical, bg: Colors.criticalSoft, border: Colors.criticalBorder },
  brand: { fg: Colors.secondary, bg: Colors.secondarySoft, border: "rgba(16,163,148,0.45)" },
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
    shadowColor: Colors.accent,
    shadowOpacity: 0.08,
    shadowRadius: 14,
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

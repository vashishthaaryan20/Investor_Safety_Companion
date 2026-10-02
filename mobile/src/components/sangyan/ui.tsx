import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";

import {
  Colors,
  Elevation,
  Layout,
  Radius,
  Space,
  ToneColors,
  Typography,
  type Tone,
  type TypographyVariant,
} from "@/constants/design";

export type IconName = ComponentProps<typeof Ionicons>["name"];

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

const TEXT_TONES = {
  ink: Colors.ink,
  default: Colors.text,
  muted: Colors.muted,
  inverse: Colors.inverse,
  inverseMuted: Colors.inverseMuted,
  brand: Colors.secondary,
  primary: Colors.primary,
  success: Colors.success,
  caution: Colors.caution,
  warning: Colors.warning,
  critical: Colors.critical,
} as const;

export type TextTone = keyof typeof TEXT_TONES;

interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  tone?: TextTone;
  align?: TextStyle["textAlign"];
  style?: StyleProp<TextStyle>;
}

const HEADING_VARIANTS: TypographyVariant[] = ["display", "title", "heading"];

export function AppText({
  variant = "body",
  tone,
  align,
  style,
  accessibilityRole,
  ...rest
}: AppTextProps) {
  const isHeading = HEADING_VARIANTS.includes(variant);
  const color = TEXT_TONES[tone ?? (isHeading ? "ink" : "default")];
  return (
    <Text
      {...rest}
      accessibilityRole={accessibilityRole ?? (isHeading ? "header" : undefined)}
      style={[Typography[variant], { color }, align && { textAlign: align }, style]}
    />
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/**
 * `inverse` / `inverseSecondary` are for dark (navy) surfaces.
 * `ghost` is kept as an alias of `tertiary`.
 */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "danger"
  | "inverse"
  | "inverseSecondary"
  | "ghost";

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  /** Shows a spinner, blocks repeat presses, and is announced as busy. */
  loading?: boolean;
  loadingLabel?: string;
  accessibilityHint?: string;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}

const BUTTON_COLORS: Record<
  Exclude<ButtonVariant, "ghost">,
  { bg: string; pressed: string; fg: string; border?: string }
> = {
  primary: { bg: Colors.primary, pressed: Colors.primaryPressed, fg: Colors.inverse },
  secondary: {
    bg: Colors.surface,
    pressed: Colors.surfaceMuted,
    fg: Colors.primary,
    border: Colors.borderStrong,
  },
  tertiary: { bg: "transparent", pressed: Colors.secondarySoft, fg: Colors.secondary },
  danger: { bg: Colors.critical, pressed: "#991B1B", fg: Colors.inverse },
  inverse: { bg: Colors.surface, pressed: "#E2E8F0", fg: Colors.primary },
  inverseSecondary: {
    bg: "transparent",
    pressed: "rgba(255,255,255,0.12)",
    fg: Colors.inverse,
    border: "rgba(255,255,255,0.55)",
  },
};

export function AppButton({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled,
  loading,
  loadingLabel,
  accessibilityHint,
  compact,
  style,
}: AppButtonProps) {
  const colors = BUTTON_COLORS[variant === "ghost" ? "tertiary" : variant];
  const inactive = disabled || loading;
  const showDisabledLook = disabled && !loading;
  const fg = showDisabledLook ? Colors.disabledText : colors.fg;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading && loadingLabel ? loadingLabel : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: pressed && !inactive ? colors.pressed : colors.bg,
          borderColor: colors.border ?? "transparent",
        },
        showDisabledLook && styles.buttonDisabled,
        showDisabledLook && variant === "tertiary" && styles.buttonDisabledTertiary,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        icon && <Ionicons name={icon} size={20} color={fg} />
      )}
      <Text style={[styles.buttonLabel, { color: fg }]} numberOfLines={2}>
        {loading && loadingLabel ? loadingLabel : label}
      </Text>
    </Pressable>
  );
}

interface IconButtonProps {
  icon: IconName;
  /** Read by screen readers; icon-only buttons must always have one. */
  label: string;
  onPress: () => void;
  color?: string;
  size?: number;
  filled?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function IconButton({
  icon,
  label,
  onPress,
  color = Colors.primary,
  size = 22,
  filled,
  disabled,
  style,
}: IconButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [
        styles.iconButton,
        filled && { backgroundColor: Colors.surfaceMuted },
        pressed && { backgroundColor: Colors.overlay },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color} />
    </Pressable>
  );
}

interface TextLinkProps {
  label: string;
  onPress: () => void;
  icon?: IconName;
  trailingIcon?: IconName;
  tone?: "brand" | "muted" | "critical";
  accessibilityHint?: string;
  accessibilityState?: { expanded?: boolean };
  style?: StyleProp<ViewStyle>;
}

export function TextLink({
  label,
  onPress,
  icon,
  trailingIcon,
  tone = "brand",
  accessibilityHint,
  accessibilityState,
  style,
}: TextLinkProps) {
  const color = TEXT_TONES[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState}
      onPress={onPress}
      style={({ pressed }) => [styles.textLink, pressed && { opacity: 0.6 }, style]}
    >
      {icon && <Ionicons name={icon} size={18} color={color} />}
      <Text style={[Typography.label, { color }]}>{label}</Text>
      {trailingIcon && <Ionicons name={trailingIcon} size={16} color={color} />}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

interface CardProps {
  children: ReactNode;
  /** `outlined` for nested or secondary content, `tinted` to carry a meaning colour. */
  variant?: "elevated" | "outlined" | "tinted";
  tone?: Tone;
  style?: StyleProp<ViewStyle>;
}

export function Card({ children, variant = "elevated", tone = "neutral", style }: CardProps) {
  const tint = ToneColors[tone];
  return (
    <View
      style={[
        styles.card,
        variant === "elevated" && Elevation.card,
        variant === "outlined" && styles.cardOutlined,
        variant === "tinted" && { backgroundColor: tint.bg, borderColor: tint.border, borderWidth: 1 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  action?: { label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}

export function SectionHeader({ title, subtitle, icon, action, style }: SectionHeaderProps) {
  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionTitleRow}>
        {icon && <Ionicons name={icon} size={20} color={Colors.primary} />}
        <AppText variant="heading" style={styles.sectionTitle}>
          {title}
        </AppText>
        {action && <TextLink label={action.label} onPress={action.onPress} />}
      </View>
      {subtitle && (
        <AppText variant="caption" tone="muted">
          {subtitle}
        </AppText>
      )}
    </View>
  );
}

export function IconBadge({
  icon,
  color,
  background,
  size = 56,
}: {
  icon: IconName;
  color: string;
  background: string;
  size?: number;
}) {
  return (
    <View
      style={[
        styles.iconBadge,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: background },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

export function BulletList({
  items,
  color = Colors.secondary,
}: {
  items: string[];
  color?: string;
}) {
  return (
    <View style={styles.bulletList}>
      {items.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: color }]} />
          <AppText style={styles.bulletText}>{item}</AppText>
        </View>
      ))}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.divider, style]} />;
}

interface OptionCardProps {
  icon: IconName;
  title: string;
  description?: string;
  onPress: () => void;
  iconBackground?: string;
  disabled?: boolean;
  loading?: boolean;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
}

/** Large tappable row for choosing between actions (gallery, camera, topics). */
export function OptionCard({
  icon,
  title,
  description,
  onPress,
  iconBackground = Colors.secondary,
  disabled,
  loading,
  accessibilityHint,
  style,
}: OptionCardProps) {
  const inactive = disabled || loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={description ? `${title}. ${description}` : title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      style={({ pressed }) => [
        styles.option,
        pressed && { backgroundColor: Colors.surfaceMuted },
        disabled && !loading && { opacity: 0.55 },
        style,
      ]}
    >
      <View style={[styles.optionIcon, { backgroundColor: iconBackground }]}>
        {loading ? (
          <ActivityIndicator color={Colors.inverse} />
        ) : (
          <Ionicons name={icon} size={26} color={Colors.inverse} />
        )}
      </View>
      <View style={styles.optionBody}>
        <AppText variant="subheading" tone="ink">
          {title}
        </AppText>
        {!!description && (
          <AppText variant="caption" tone="muted">
            {description}
          </AppText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.subtle} />
    </Pressable>
  );
}

interface ListRowProps {
  icon: IconName;
  label: string;
  description?: string;
  onPress: () => void;
  /** `external` shows an "opens outside the app" icon instead of a chevron. */
  external?: boolean;
  iconColor?: string;
  divider?: boolean;
  accessibilityHint?: string;
}

/** Row inside a card list: helplines, links, settings. */
export function ListRow({
  icon,
  label,
  description,
  onPress,
  external,
  iconColor = Colors.secondary,
  divider,
  accessibilityHint,
}: ListRowProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={external ? "link" : "button"}
      accessibilityLabel={description ? `${label}. ${description}` : label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.listRow,
        divider && styles.listRowDivider,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Ionicons name={icon} size={22} color={iconColor} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" tone="ink">
          {label}
        </AppText>
        {!!description && (
          <AppText variant="caption" tone="muted">
            {description}
          </AppText>
        )}
      </View>
      <Ionicons
        name={external ? "open-outline" : "chevron-forward"}
        size={18}
        color={Colors.subtle}
      />
    </Pressable>
  );
}

/** Small icon + caption row for privacy notes and reassurance. */
export function InfoNote({
  icon = "lock-closed-outline",
  children,
  style,
}: {
  icon?: IconName;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.infoNote, style]}>
      <Ionicons name={icon} size={18} color={Colors.muted} style={styles.infoNoteIcon} />
      <AppText variant="caption" tone="muted" style={styles.flex}>
        {children}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: Layout.buttonHeight,
    borderRadius: Radius.md,
    borderWidth: 1.5,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: Space.sm,
  },
  buttonCompact: {
    minHeight: Layout.minTouch,
    paddingHorizontal: Space.md,
  },
  buttonDisabled: {
    backgroundColor: Colors.disabledBackground,
    borderColor: Colors.disabledBackground,
  },
  buttonDisabledTertiary: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  buttonLabel: {
    ...Typography.subheading,
    textAlign: "center",
    flexShrink: 1,
  },
  iconButton: {
    width: Layout.minTouch,
    height: Layout.minTouch,
    borderRadius: Layout.minTouch / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  textLink: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs,
    alignSelf: "flex-start",
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Layout.cardPadding,
  },
  cardOutlined: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionHeader: {
    marginBottom: Space.md,
    gap: Space.xs,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  sectionTitle: {
    flex: 1,
  },
  iconBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
  bulletList: {
    gap: Space.md,
  },
  bulletRow: {
    flexDirection: "row",
    gap: Space.md,
    alignItems: "flex-start",
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 7,
  },
  bulletText: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
  },
  flex: {
    flex: 1,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    padding: Space.lg,
    minHeight: 76,
    borderRadius: Radius.lg,
    backgroundColor: Colors.surface,
    borderWidth: 1.5,
    borderColor: Colors.border,
  },
  optionIcon: {
    width: 52,
    height: 52,
    borderRadius: Radius.lg,
    alignItems: "center",
    justifyContent: "center",
  },
  optionBody: {
    flex: 1,
    gap: Space.xxs,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    minHeight: 56,
    paddingVertical: Space.md,
  },
  listRowDivider: {
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  infoNote: {
    flexDirection: "row",
    gap: Space.sm,
    alignItems: "flex-start",
  },
  infoNoteIcon: {
    marginTop: 1,
  },
});

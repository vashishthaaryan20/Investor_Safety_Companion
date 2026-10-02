import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentProps, ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CardShadow, Palette, Radius } from "@/constants/palette";

type IconName = ComponentProps<typeof Ionicons>["name"];

type ButtonVariant = "primary" | "secondary" | "ghost";

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function AppButton({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled,
  loading,
  style,
}: AppButtonProps) {
  const textColor =
    variant === "primary" ? "#FFFFFF" : variant === "secondary" ? Palette.navy : Palette.brand;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading }}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        variant === "primary" && styles.buttonPrimary,
        variant === "secondary" && styles.buttonSecondary,
        variant === "ghost" && styles.buttonGhost,
        (disabled || loading) && styles.buttonDisabled,
        pressed && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={20} color={textColor} />}
          <Text style={[styles.buttonLabel, { color: textColor }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Card({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function SectionHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        {icon && <Ionicons name={icon} size={20} color={Palette.navy} />}
        <Text style={styles.sectionTitle} accessibilityRole="header">
          {title}
        </Text>
      </View>
      {subtitle && <Text style={styles.sectionSubtitle}>{subtitle}</Text>}
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
    >
      <Ionicons name={icon} size={size * 0.5} color={color} />
    </View>
  );
}

export function BulletList({ items, color = Palette.brand }: { items: string[]; color?: string }) {
  return (
    <View style={styles.bulletList}>
      {items.map((item) => (
        <View key={item} style={styles.bulletRow}>
          <View style={[styles.bulletDot, { backgroundColor: color }]} />
          <Text style={styles.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

interface StatusScreenProps {
  icon: IconName;
  color: string;
  background: string;
  eyebrow: string;
  title: string;
  message: string;
  children?: ReactNode;
  actions: ReactNode;
}

export function StatusScreen({
  icon,
  color,
  background,
  eyebrow,
  title,
  message,
  children,
  actions,
}: StatusScreenProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.statusRoot}>
      <ScrollView
        contentContainerStyle={[styles.statusContent, { paddingTop: insets.top + 40 }]}
      >
        <View style={styles.statusHero}>
          <IconBadge icon={icon} color={color} background={background} size={84} />
          <Text style={[styles.statusEyebrow, { color }]}>{eyebrow}</Text>
          <Text style={styles.statusTitle} accessibilityRole="header">
            {title}
          </Text>
          <Text style={styles.statusMessage}>{message}</Text>
        </View>
        {children}
      </ScrollView>
      <View style={[styles.statusActions, { paddingBottom: insets.bottom + 16 }]}>
        {actions}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: Radius.md,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  buttonPrimary: {
    backgroundColor: Palette.brand,
  },
  buttonSecondary: {
    backgroundColor: Palette.surface,
    borderWidth: 1.5,
    borderColor: Palette.border,
  },
  buttonGhost: {
    backgroundColor: "transparent",
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.99 }],
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  card: {
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: 18,
    ...CardShadow,
  },
  sectionHeader: {
    marginBottom: 12,
    gap: 4,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: Palette.ink,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Palette.muted,
    lineHeight: 20,
  },
  iconBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
  bulletList: {
    gap: 10,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 12,
    alignItems: "flex-start",
  },
  bulletDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  bulletText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 23,
    color: Palette.text,
  },
  statusRoot: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  statusContent: {
    paddingHorizontal: 22,
    paddingBottom: 24,
    gap: 20,
  },
  statusHero: {
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
  },
  statusEyebrow: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  statusTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: Palette.ink,
    textAlign: "center",
  },
  statusMessage: {
    fontSize: 16,
    lineHeight: 24,
    color: Palette.muted,
    textAlign: "center",
  },
  statusActions: {
    paddingHorizontal: 22,
    paddingTop: 12,
    gap: 10,
    backgroundColor: Palette.background,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
});

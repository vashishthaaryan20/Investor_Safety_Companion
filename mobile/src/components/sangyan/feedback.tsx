import Ionicons from "@expo/vector-icons/Ionicons";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Layout, Radius, Space, ToneColors, type Tone } from "@/constants/design";
import type { ImageSource, PickResult } from "@/services/image-picker";

import { StatusBarScrim } from "./screen";
import { AppButton, AppText, IconBadge, TextLink, type IconName } from "./ui";

// ---------------------------------------------------------------------------
// Inline alert: errors, warnings, notices and confirmations inside a screen
// ---------------------------------------------------------------------------

const TONE_ICONS: Record<Tone, IconName> = {
  neutral: "information-circle",
  info: "information-circle",
  brand: "information-circle",
  success: "checkmark-circle",
  caution: "alert-circle",
  warning: "alert-circle",
  critical: "close-circle",
};

export interface AlertAction {
  label: string;
  onPress: () => void;
  icon?: IconName;
}

interface InlineAlertProps {
  tone?: Tone;
  title: string;
  message?: string;
  icon?: IconName;
  actions?: AlertAction[];
  style?: StyleProp<ViewStyle>;
}

export function InlineAlert({ tone = "info", title, message, icon, actions, style }: InlineAlertProps) {
  const colors = ToneColors[tone];
  const urgent = tone === "critical" || tone === "warning";
  return (
    <View
      style={[styles.alert, { backgroundColor: colors.bg, borderColor: colors.border }, style]}
      accessibilityRole={urgent ? "alert" : "summary"}
      accessibilityLiveRegion={urgent ? "assertive" : "polite"}
    >
      <Ionicons name={icon ?? TONE_ICONS[tone]} size={22} color={colors.fg} />
      <View style={styles.alertBody}>
        <AppText variant="bodyStrong" tone="ink">
          {title}
        </AppText>
        {!!message && <AppText variant="caption">{message}</AppText>}
        {!!actions?.length && (
          <View style={styles.alertActions}>
            {actions.map((action) => (
              <TextLink
                key={action.label}
                label={action.label}
                icon={action.icon}
                onPress={action.onPress}
              />
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

/** Explains why an image wasn't picked and offers the matching recovery path. */
export function PickResultNotice({
  result,
  onRetry,
  style,
}: {
  result: Exclude<PickResult, { status: "picked" }> & { source: ImageSource };
  onRetry: (source: ImageSource) => void;
  style?: StyleProp<ViewStyle>;
}) {
  if (result.status === "denied") {
    return (
      <InlineAlert
        tone="warning"
        icon="camera-outline"
        title="Camera access is off"
        message={
          result.canAskAgain
            ? "SANGYAN Shield only uses the camera when you choose to photograph a message. Nothing is recorded in the background."
            : "Camera access was turned off for SANGYAN Shield. Turn it on in Settings, or choose a screenshot from your gallery — that needs no permission."
        }
        actions={[
          result.canAskAgain
            ? { label: "Allow camera", icon: "camera-outline", onPress: () => onRetry("camera") }
            : { label: "Open Settings", icon: "settings-outline", onPress: () => Linking.openSettings() },
          { label: "Use gallery instead", icon: "images-outline", onPress: () => onRetry("library") },
        ]}
        style={style}
      />
    );
  }
  if (result.status === "error") {
    return (
      <InlineAlert
        tone="critical"
        title="Couldn't open that image"
        message="Something went wrong while opening the picker. Try again, or choose a different screenshot."
        actions={[{ label: "Try again", icon: "refresh", onPress: () => onRetry(result.source) }]}
        style={style}
      />
    );
  }
  return (
    <InlineAlert
      tone="neutral"
      title={result.source === "camera" ? "No photo taken" : "No screenshot selected"}
      message="Nothing was sent. Choose one when you're ready."
      style={style}
    />
  );
}

/** Entry point to emergency help; looks the same wherever it appears. */
export function EmergencyBanner({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Lost money or shared your OTP? Get step-by-step emergency help now."
      style={({ pressed }) => [styles.emergency, pressed && { opacity: 0.85 }]}
    >
      <IconBadge icon="medkit" color={Colors.background} background={Colors.critical} size={44} />
      <View style={styles.flex}>
        <AppText variant="bodyStrong" tone="critical">
          Lost money or shared your OTP?
        </AppText>
        <AppText variant="caption">Get step-by-step emergency help now.</AppText>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.critical} />
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  icon: IconName;
  title: string;
  message: string;
  action?: AlertAction;
  secondaryAction?: AlertAction;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({ icon, title, message, action, secondaryAction, style }: EmptyStateProps) {
  return (
    <View style={[styles.empty, style]}>
      <View
        style={styles.illustration}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.illustrationRing} />
        <View style={[styles.illustrationDot, styles.dotTop]} />
        <View style={[styles.illustrationDot, styles.dotBottom]} />
        <View style={styles.illustrationCore}>
          <Ionicons name={icon} size={40} color={Colors.secondary} />
        </View>
      </View>
      <AppText variant="heading" align="center">
        {title}
      </AppText>
      <AppText tone="muted" align="center">
        {message}
      </AppText>
      {action && (
        <AppButton
          label={action.label}
          icon={action.icon}
          onPress={action.onPress}
          style={styles.emptyButton}
        />
      )}
      {secondaryAction && (
        <AppButton
          label={secondaryAction.label}
          icon={secondaryAction.icon}
          variant="tertiary"
          onPress={secondaryAction.onPress}
          style={styles.emptyButton}
        />
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Loading and progress
// ---------------------------------------------------------------------------

export function LoadingState({ label, hint }: { label: string; hint?: string }) {
  return (
    <View
      style={styles.loading}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={hint ? `${label}. ${hint}` : label}
      accessibilityState={{ busy: true }}
    >
      <ActivityIndicator size="large" color={Colors.secondary} />
      <AppText variant="subheading" tone="ink" align="center">
        {label}
      </AppText>
      {!!hint && (
        <AppText variant="caption" tone="muted" align="center">
          {hint}
        </AppText>
      )}
    </View>
  );
}

/** Vertical checklist of steps for long-running work. */
export function ProgressList({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <View
      style={styles.progressList}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}
      accessibilityValue={{ min: 0, max: steps.length, now: current + 1 }}
      accessibilityLiveRegion="polite"
    >
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={label} style={styles.progressRow}>
            {active ? (
              <ActivityIndicator size="small" color={Colors.secondary} style={styles.progressIcon} />
            ) : (
              <Ionicons
                name={done ? "checkmark-circle" : "ellipse-outline"}
                size={22}
                color={done ? Colors.success : Colors.subtle}
                style={styles.progressIcon}
              />
            )}
            <AppText
              variant={active ? "bodyStrong" : "body"}
              tone={active ? "ink" : "muted"}
              style={styles.flex}
            >
              {label}
              {done ? " — done" : ""}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

/** Horizontal numbered stepper for short multi-step flows. */
export function Stepper({ steps, current }: { steps: readonly string[]; current: number }) {
  return (
    <View
      style={styles.stepper}
      accessible
      accessibilityLabel={`Step ${current + 1} of ${steps.length}: ${steps[current]}`}
    >
      {steps.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <View key={label} style={styles.stepItem}>
            <View style={[styles.stepDot, done && styles.stepDotDone, active && styles.stepDotActive]}>
              {done ? (
                <Ionicons name="checkmark" size={16} color={Colors.inverse} />
              ) : (
                <AppText variant="label" tone={active ? "brand" : "muted"}>
                  {index + 1}
                </AppText>
              )}
            </View>
            <AppText
              variant="caption"
              tone={active ? "ink" : "muted"}
              style={active && styles.stepLabelActive}
              numberOfLines={1}
            >
              {label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Full-screen status (failure, inconclusive)
// ---------------------------------------------------------------------------

interface StatusScreenProps {
  tone: Tone;
  icon: IconName;
  eyebrow: string;
  title: string;
  message: string;
  children?: ReactNode;
  actions: ReactNode;
}

export function StatusScreen({ tone, icon, eyebrow, title, message, children, actions }: StatusScreenProps) {
  const insets = useSafeAreaInsets();
  const colors = ToneColors[tone];

  return (
    <View style={styles.statusRoot}>
      <ScrollView
        contentContainerStyle={[styles.statusContent, { paddingTop: insets.top + Space.xxxl }]}
      >
        <View style={styles.contentWidth}>
          <View style={styles.statusHero} accessible accessibilityRole="alert">
            <IconBadge icon={icon} color={colors.fg} background={colors.bg} size={84} />
            <AppText variant="overline" style={{ color: colors.fg, marginTop: Space.sm }}>
              {eyebrow}
            </AppText>
            <AppText variant="title" align="center">
              {title}
            </AppText>
            <AppText tone="muted" align="center">
              {message}
            </AppText>
          </View>
          {children}
        </View>
      </ScrollView>
      <StatusBarScrim />
      <View style={[styles.statusActions, { paddingBottom: insets.bottom + Space.lg }]}>
        <View style={[styles.contentWidth, styles.statusActionsInner]}>{actions}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  alert: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Space.md,
    padding: Space.md,
    borderRadius: Radius.md,
    borderWidth: 1,
  },
  alertBody: {
    flex: 1,
    gap: Space.xxs,
  },
  alertActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    columnGap: Space.lg,
  },
  emergency: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    padding: Space.lg,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: ToneColors.critical.border,
    backgroundColor: ToneColors.critical.bg,
  },
  empty: {
    alignItems: "center",
    gap: Space.sm,
    paddingVertical: Space.xxl,
    paddingHorizontal: Space.sm,
  },
  illustration: {
    width: 128,
    height: 128,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: Space.sm,
  },
  illustrationRing: {
    position: "absolute",
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: Colors.secondarySoft,
  },
  illustrationCore: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: ToneColors.brand.border,
  },
  illustrationDot: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  dotTop: {
    top: 10,
    right: 14,
    backgroundColor: Colors.highlight,
  },
  dotBottom: {
    bottom: 14,
    left: 10,
    width: 10,
    height: 10,
    backgroundColor: Colors.accent,
    opacity: 0.35,
  },
  emptyButton: {
    alignSelf: "stretch",
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: Space.md,
    padding: Space.xxl,
  },
  progressList: {
    gap: Space.lg,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.xl,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
  },
  progressIcon: {
    width: 22,
  },
  stepper: {
    flexDirection: "row",
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    paddingVertical: Space.md,
    paddingHorizontal: Space.sm,
  },
  stepItem: {
    flex: 1,
    alignItems: "center",
    gap: Space.xs,
  },
  stepDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    borderWidth: 1.5,
    borderColor: Colors.borderStrong,
  },
  stepDotActive: {
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondarySoft,
  },
  stepDotDone: {
    backgroundColor: Colors.success,
    borderColor: Colors.success,
  },
  stepLabelActive: {
    fontWeight: "800",
  },
  statusRoot: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  statusContent: {
    paddingHorizontal: Layout.screenPadding,
    paddingBottom: Space.xxl,
  },
  contentWidth: {
    width: "100%",
    maxWidth: Layout.maxContentWidth,
    alignSelf: "center",
    gap: Space.xl,
  },
  statusHero: {
    alignItems: "center",
    gap: Space.sm,
    marginBottom: Space.sm,
  },
  statusActions: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Space.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  statusActionsInner: {
    gap: Space.sm,
  },
});

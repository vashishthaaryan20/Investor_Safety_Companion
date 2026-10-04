import type { ReactNode, Ref } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Colors, Gradients, Layout, Space } from "@/constants/design";

import { AppText } from "./ui";

interface ScreenProps {
  children: ReactNode;
  /** Tab screens reserve space for the tab bar. */
  tabs?: boolean;
  /** Screens without a native header pad for the status bar themselves. */
  safeTop?: boolean;
  /** Sticky actions pinned to the bottom, outside the scroll area. */
  footer?: ReactNode;
  keyboard?: boolean;
  scrollRef?: Ref<ScrollView>;
  contentStyle?: StyleProp<ViewStyle>;
}

/**
 * Standard scrollable screen: safe areas, consistent padding and section spacing,
 * and a centred max width so layouts stay readable on tablets and foldables.
 */
export function Screen({
  children,
  tabs,
  safeTop,
  footer,
  keyboard,
  scrollRef,
  contentStyle,
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = footer
    ? Space.xxl
    : insets.bottom + Space.xxl + (tabs ? Layout.tabBarInset : 0);

  const body = (
    <View style={[styles.root, styles.glow]}>
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={[
          styles.content,
          { paddingTop: safeTop ? insets.top + Space.lg : Space.sm, paddingBottom: bottomPad },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.width, contentStyle]}>{children}</View>
      </ScrollView>
      {safeTop && <StatusBarScrim />}
      {footer && (
        <View
          style={[
            styles.footer,
            { paddingBottom: insets.bottom + Space.md + (tabs ? Layout.tabBarInset : 0) },
          ]}
        >
          <View style={[styles.width, styles.footerInner]}>{footer}</View>
        </View>
      )}
    </View>
  );

  if (!keyboard) return body;
  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {body}
    </KeyboardAvoidingView>
  );
}

/** Keeps scrolled content from showing through the transparent edge-to-edge status bar. */
export function StatusBarScrim() {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" style={[styles.scrim, { height: insets.top }]} />;
}

/** Large title used at the top of each tab so the user always knows where they are. */
export function ScreenTitle({
  title,
  subtitle,
  eyebrow,
  right,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  right?: ReactNode;
}) {
  return (
    <View style={styles.titleBlock}>
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          {!!eyebrow && (
            <AppText variant="overline" tone="brand">
              {eyebrow}
            </AppText>
          )}
          <AppText variant="display">{title}</AppText>
        </View>
        {right}
      </View>
      {!!subtitle && <AppText tone="muted">{subtitle}</AppText>}
    </View>
  );
}

/** Applies the standard content width to custom scroll containers such as lists. */
export const contentWidth: ViewStyle = {
  width: "100%",
  maxWidth: Layout.maxContentWidth,
  alignSelf: "center",
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  flex: {
    flex: 1,
  },
  glow: {
    experimental_backgroundImage: Gradients.screen,
  },
  content: {
    paddingHorizontal: Layout.screenPadding,
  },
  width: {
    ...contentWidth,
    gap: Layout.sectionGap,
  },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.backgroundTop,
  },
  footer: {
    paddingHorizontal: Layout.screenPadding,
    paddingTop: Space.md,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  footerInner: {
    gap: Space.sm,
  },
  titleBlock: {
    gap: Space.xs,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
  },
  titleText: {
    flex: 1,
    gap: Space.xxs,
  },
});

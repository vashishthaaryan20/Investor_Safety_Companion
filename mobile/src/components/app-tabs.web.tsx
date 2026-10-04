import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Layout, Radius, Space, Typography } from '@/constants/design';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="history" href="/history" asChild>
            <TabButton>History</TabButton>
          </TabTrigger>
          <TabTrigger name="learn" href="/learn" asChild>
            <TabButton>Learn</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityState={{ selected: !!isFocused }}
      style={({ pressed }) => [
        styles.tabButton,
        isFocused && styles.tabButtonActive,
        pressed && styles.pressed,
      ]}>
      <Text style={[styles.tabLabel, isFocused && styles.tabLabelActive]}>{children}</Text>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  return (
    <View {...props} style={styles.tabListContainer}>
      <View style={styles.innerContainer} accessibilityRole="tablist">
        <Text style={styles.brandText}>SANGYAN Shield</Text>
        {props.children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
    padding: Space.lg,
    alignItems: 'center',
  },
  innerContainer: {
    width: '100%',
    maxWidth: Layout.maxContentWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingVertical: Space.sm,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.pill,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  brandText: {
    ...Typography.label,
    color: Colors.accent,
    marginRight: 'auto',
  },
  tabButton: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    borderRadius: Radius.pill,
  },
  tabButtonActive: {
    backgroundColor: Colors.secondarySoft,
  },
  tabLabel: {
    ...Typography.label,
    color: Colors.muted,
  },
  tabLabelActive: {
    color: Colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
});

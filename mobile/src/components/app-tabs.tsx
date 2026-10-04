import Ionicons from '@expo/vector-icons/Ionicons';
import { VectorIcon } from 'expo-router';
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/design';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={Colors.surface}
      indicatorColor={Colors.secondarySoft}
      iconColor={{ default: Colors.muted, selected: Colors.accent }}
      labelStyle={{
        default: { color: Colors.muted, fontSize: 12 },
        selected: { color: Colors.accent, fontSize: 12, fontWeight: '700' },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<VectorIcon family={Ionicons} name="home-outline" />}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="history">
        <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<VectorIcon family={Ionicons} name="time-outline" />}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="learn">
        <NativeTabs.Trigger.Label>Learn</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<VectorIcon family={Ionicons} name="school-outline" />}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

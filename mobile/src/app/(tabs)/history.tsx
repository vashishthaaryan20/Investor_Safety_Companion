import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  SectionList,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { HistoryRow } from "@/components/sangyan/history-row";
import { AppButton, Card, IconBadge } from "@/components/sangyan/ui";
import { Palette, Radius } from "@/constants/palette";
import { isInconclusive } from "@/constants/risk";
import { BottomTabInset } from "@/constants/theme";
import { useScan, type ScanRecord } from "@/state/scan-store";
import { formatDayLabel } from "@/utils/format-date";

interface HistorySection {
  title: string;
  data: ScanRecord[];
}

function groupByDay(records: ScanRecord[]): HistorySection[] {
  const sections: HistorySection[] = [];
  for (const record of records) {
    const title = formatDayLabel(record.createdAt);
    const last = sections[sections.length - 1];
    if (last && last.title === title) {
      last.data.push(record);
    } else {
      sections.push({ title, data: [record] });
    }
  }
  return sections;
}

export default function HistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    history,
    historyLoaded,
    settings,
    showResult,
    deleteScan,
    clearHistory,
    setSaveHistory,
    resetDraft,
  } = useScan();

  const highRisk = history.filter(
    (record) => !isInconclusive(record.result) && record.result.risk.level === "HIGH_ATTENTION"
  ).length;

  const openRecord = (record: ScanRecord) => {
    showResult(record);
    router.push(isInconclusive(record.result) ? "/inconclusive" : "/result");
  };

  const confirmDelete = (record: ScanRecord) => {
    Alert.alert("Delete this check?", "It will be removed from this phone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteScan(record.id) },
    ]);
  };

  const confirmClearAll = () => {
    Alert.alert(
      "Clear all history?",
      `This permanently deletes all ${history.length} saved check${history.length === 1 ? "" : "s"} from this phone. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear all", style: "destructive", onPress: clearHistory },
      ]
    );
  };

  const startCheck = () => {
    resetDraft("image");
    router.push("/scan");
  };

  const header = (
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">
        History
      </Text>
      <Text style={styles.subtitle}>
        Look back at your past checks without uploading them again.
      </Text>
      {history.length > 0 && (
        <View style={styles.stats}>
          <View style={styles.stat}>
            <Text style={styles.statValue}>{history.length}</Text>
            <Text style={styles.statLabel}>Saved checks</Text>
          </View>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: Palette.danger }]}>{highRisk}</Text>
            <Text style={styles.statLabel}>High risk</Text>
          </View>
        </View>
      )}
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      <Card style={styles.privacyCard}>
        <View style={styles.privacyHeader}>
          <Ionicons name="lock-closed-outline" size={20} color={Palette.navy} />
          <Text style={styles.privacyTitle}>Your history stays on this phone</Text>
        </View>
        <Text style={styles.privacyText}>
          We save the text we read and the result, never your screenshot. Saved text can still
          include personal details, so clear your history if you share this phone.
        </Text>
        <View style={styles.toggleRow}>
          <View style={styles.toggleText}>
            <Text style={styles.toggleTitle}>Save new checks</Text>
            <Text style={styles.toggleHint}>
              {settings.saveHistory
                ? "New checks are added to this list."
                : "New checks won't be saved."}
            </Text>
          </View>
          <Switch
            value={settings.saveHistory}
            onValueChange={setSaveHistory}
            trackColor={{ true: Palette.brand, false: Palette.border }}
            accessibilityLabel="Save new checks on this phone"
          />
        </View>
        {history.length > 0 && (
          <AppButton
            label="Clear all history"
            icon="trash-outline"
            variant="secondary"
            onPress={confirmClearAll}
            style={styles.clearButton}
          />
        )}
      </Card>
    </View>
  );

  const contentStyle = {
    paddingTop: insets.top + 20,
    paddingBottom: insets.bottom + BottomTabInset + 24,
  };

  if (!historyLoaded) {
    return (
      <View style={[styles.screen, styles.loading]}>
        <ActivityIndicator color={Palette.brand} size="large" />
      </View>
    );
  }

  if (history.length === 0) {
    return (
      <SectionList
        style={styles.screen}
        contentContainerStyle={[styles.content, contentStyle]}
        sections={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <>
            {header}
            <Card style={styles.empty}>
              <IconBadge
                icon="time-outline"
                color={Palette.brand}
                background={Palette.brandSoft}
                size={72}
              />
              <Text style={styles.emptyTitle}>No saved checks yet</Text>
              <Text style={styles.emptyText}>
                {settings.saveHistory
                  ? "When you check a screenshot or message, the result will be saved here so you can open it again anytime."
                  : "Saving is turned off. Turn on \"Save new checks\" below to keep your results here."}
              </Text>
              <AppButton
                label="Start a check"
                icon="scan-outline"
                onPress={startCheck}
                style={styles.emptyButton}
              />
            </Card>
          </>
        }
        ListFooterComponent={footer}
      />
    );
  }

  return (
    <SectionList
      style={styles.screen}
      contentContainerStyle={[styles.content, contentStyle]}
      sections={groupByDay(history)}
      keyExtractor={(record) => record.id}
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      ListFooterComponent={footer}
      renderSectionHeader={({ section }) => (
        <Text style={styles.sectionTitle}>{section.title}</Text>
      )}
      renderItem={({ item, index, section }) => (
        <View
          style={[
            styles.rowCard,
            index === 0 && styles.rowFirst,
            index === section.data.length - 1 && styles.rowLast,
            index > 0 && styles.rowDivider,
          ]}
        >
          <HistoryRow
            record={item}
            timeOnly
            onPress={() => openRecord(item)}
            onDelete={() => confirmDelete(item)}
          />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Palette.background,
  },
  loading: {
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 20,
  },
  header: {
    marginBottom: 8,
  },
  title: {
    fontSize: 30,
    fontWeight: "800",
    color: Palette.ink,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: Palette.muted,
    marginTop: 6,
  },
  stats: {
    flexDirection: "row",
    gap: 12,
    marginTop: 18,
  },
  stat: {
    flex: 1,
    backgroundColor: Palette.surface,
    borderRadius: Radius.lg,
    padding: 14,
  },
  statValue: {
    fontSize: 24,
    fontWeight: "800",
    color: Palette.ink,
  },
  statLabel: {
    fontSize: 13,
    color: Palette.muted,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "800",
    color: Palette.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 20,
    marginBottom: 8,
  },
  rowCard: {
    backgroundColor: Palette.surface,
    paddingHorizontal: 14,
  },
  rowFirst: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
  },
  rowLast: {
    borderBottomLeftRadius: Radius.lg,
    borderBottomRightRadius: Radius.lg,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  empty: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 32,
    marginTop: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Palette.ink,
    marginTop: 6,
  },
  emptyText: {
    fontSize: 15,
    lineHeight: 22,
    color: Palette.muted,
    textAlign: "center",
  },
  emptyButton: {
    alignSelf: "stretch",
    marginTop: 8,
  },
  footer: {
    marginTop: 24,
  },
  privacyCard: {
    gap: 12,
  },
  privacyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  privacyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: Palette.ink,
  },
  privacyText: {
    fontSize: 14,
    lineHeight: 21,
    color: Palette.text,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Palette.border,
  },
  toggleText: {
    flex: 1,
  },
  toggleTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: Palette.ink,
  },
  toggleHint: {
    fontSize: 13,
    color: Palette.muted,
    marginTop: 2,
  },
  clearButton: {
    borderColor: "#FECACA",
  },
});

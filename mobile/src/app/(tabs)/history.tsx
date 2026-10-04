import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { SectionList, StyleSheet, Switch, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, LoadingState } from "@/components/sangyan/feedback";
import { HistoryRow } from "@/components/sangyan/history-row";
import { contentWidth, ScreenTitle, StatusBarScrim } from "@/components/sangyan/screen";
import { AppButton, AppText, Card } from "@/components/sangyan/ui";
import { Colors, Layout, Radius, Space } from "@/constants/design";
import { isInconclusive } from "@/constants/risk";
import { useScan, type ScanRecord } from "@/state/scan-store";
import { confirmAction } from "@/utils/confirm";
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

  const confirmDelete = async (record: ScanRecord) => {
    const confirmed = await confirmAction({
      title: "Delete this check?",
      message: "The result and the text we read will be removed from this phone.",
      confirmLabel: "Delete",
      destructive: true,
    });
    if (confirmed) deleteScan(record.id);
  };

  const confirmClearAll = async () => {
    const confirmed = await confirmAction({
      title: "Clear all history?",
      message: `This permanently deletes all ${history.length} saved check${history.length === 1 ? "" : "s"} from this phone. This can't be undone.`,
      confirmLabel: "Clear all",
      destructive: true,
    });
    if (confirmed) clearHistory();
  };

  const startCheck = () => {
    resetDraft("image");
    router.push("/scan");
  };

  const header = (
    <View style={styles.header}>
      <ScreenTitle
        title="History"
        subtitle="Look back at your past checks without uploading them again."
      />
      {history.length > 0 && (
        <View style={styles.stats}>
          <View style={styles.stat} accessible accessibilityLabel={`${history.length} saved checks`}>
            <AppText variant="title">{history.length}</AppText>
            <AppText variant="caption" tone="muted">
              Saved checks
            </AppText>
          </View>
          <View style={styles.stat} accessible accessibilityLabel={`${highRisk} high risk`}>
            <View style={styles.statValueRow}>
              <Ionicons name="warning" size={18} color={Colors.critical} />
              <AppText variant="title" tone="critical">
                {highRisk}
              </AppText>
            </View>
            <AppText variant="caption" tone="muted">
              High risk
            </AppText>
          </View>
        </View>
      )}
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      <Card style={styles.privacyCard}>
        <View style={styles.privacyHeader}>
          <Ionicons name="lock-closed-outline" size={20} color={Colors.accent} />
          <AppText variant="subheading" tone="ink" style={styles.flex} accessibilityRole="header">
            Your history stays on this phone
          </AppText>
        </View>
        <AppText variant="caption">
          We save the result and the text we read, never your screenshot. Phone, card and account
          numbers, emails and codes are masked before saving. Names or other details can still
          appear, so clear your history if you share this phone. Clearing it also removes any
          leftover temporary copies.
        </AppText>
        <View style={styles.toggleRow}>
          <View style={styles.flex}>
            <AppText variant="bodyStrong" tone="ink">
              Save new checks
            </AppText>
            <AppText variant="caption" tone="muted">
              {settings.saveHistory
                ? "New checks are added to this list."
                : "New checks won't be saved."}
            </AppText>
          </View>
          <Switch
            value={settings.saveHistory}
            onValueChange={setSaveHistory}
            trackColor={{ true: Colors.secondary, false: Colors.borderStrong }}
            thumbColor={Colors.surface}
            accessibilityLabel="Save new checks on this phone"
          />
        </View>
        {history.length > 0 && (
          <AppButton
            label="Clear all history"
            icon="trash-outline"
            variant="danger"
            onPress={confirmClearAll}
          />
        )}
      </Card>
    </View>
  );

  const contentStyle = [
    styles.content,
    {
      paddingTop: insets.top + Space.lg,
      paddingBottom: insets.bottom + Layout.tabBarInset + Space.xxl,
    },
  ];

  if (!historyLoaded) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top }]}>
        <LoadingState label="Loading your saved checks…" />
      </View>
    );
  }

  const list =
    history.length === 0 ? (
      <SectionList
        style={styles.screen}
        contentContainerStyle={contentStyle}
        sections={[]}
        renderItem={() => null}
        ListHeaderComponent={
          <>
            {header}
            <Card style={styles.empty}>
              <EmptyState
                icon="time-outline"
                title="No saved checks yet"
                message={
                  settings.saveHistory
                    ? "When you check a screenshot or message, the result will be saved here so you can open it again anytime."
                    : "Saving is turned off. Turn on “Save new checks” below to keep your results here."
                }
                action={{ label: "Start a check", icon: "scan-outline", onPress: startCheck }}
              />
            </Card>
          </>
        }
        ListFooterComponent={footer}
      />
    ) : (
      <SectionList
        style={styles.screen}
        contentContainerStyle={contentStyle}
        sections={groupByDay(history)}
        keyExtractor={(record) => record.id}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        renderSectionHeader={({ section }) => (
          <AppText variant="overline" tone="muted" style={styles.sectionTitle} accessibilityRole="header">
            {section.title}
          </AppText>
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

  return (
    <View style={styles.screen}>
      {list}
      <StatusBarScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    ...contentWidth,
    paddingHorizontal: Layout.screenPadding,
  },
  flex: {
    flex: 1,
  },
  header: {
    gap: Space.lg,
    marginBottom: Space.sm,
  },
  stats: {
    flexDirection: "row",
    gap: Space.md,
  },
  stat: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Space.md + 2,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.xs + 2,
  },
  sectionTitle: {
    marginTop: Space.xl,
    marginBottom: Space.sm,
  },
  rowCard: {
    backgroundColor: Colors.surface,
    paddingLeft: Space.md + 2,
    paddingRight: Space.xs,
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
    borderTopColor: Colors.border,
  },
  empty: {
    marginTop: Space.lg,
  },
  footer: {
    marginTop: Space.xxl,
  },
  privacyCard: {
    gap: Space.md,
  },
  privacyHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.sm,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingTop: Space.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});

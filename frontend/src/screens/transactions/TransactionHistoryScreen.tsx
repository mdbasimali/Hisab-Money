import React, { useCallback, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import type { Transaction } from '../../types';
import { AppDataService } from '../../services/mockService';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import { formatINR } from '../../utils/formatters';
import { TransactionItem } from '../../components/customer/TransactionItem';
import { useAppTheme } from '../../context/ThemeContext';

type FilterType = 'all' | 'credit' | 'payment';

export function TransactionHistoryScreen() {
  const { t } = useTranslation();
  const { isDark, colors } = useAppTheme();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadTransactions = useCallback(async () => {
    try {
      const data = await AppDataService.getTransactions();
      setTransactions(data);
    } catch (e) {
      console.error('Failed to load transaction history:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadTransactions();
    }, [loadTransactions])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadTransactions();
  }, [loadTransactions]);

  const filtered = useMemo(() => {
    if (filter === 'all') return transactions;
    return transactions.filter((t) => t.type === filter);
  }, [transactions, filter]);

  const { totalPayments, totalCredit } = useMemo(() => {
    let payments = 0;
    let credit = 0;
    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      if (t.type === 'payment') payments += t.amount;
      else if (t.type === 'credit') credit += t.amount;
    }
    return { totalPayments: payments, totalCredit: credit };
  }, [transactions]);

  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => (
      <TransactionItem
        transaction={item}
        showCustomerName
        onTransactionUpdated={loadTransactions}
      />
    ),
    [loadTransactions]
  );

  const keyExtractor = useCallback((item: Transaction) => item.id, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.white }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('history.title')}</Text>
        <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
          {t('history.showingCount', { count: transactions.length })}
        </Text>
      </View>

      {/* Summary */}
      <View style={[styles.summaryRow, { backgroundColor: colors.white }]}>
        <View style={[styles.summaryCard, { backgroundColor: colors.primaryLighter, borderColor: colors.primaryLight }]}>
          <Ionicons name="arrow-down-circle" size={20} color={colors.primary} />
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{t('customers.totalPaid')}</Text>
          <Text style={[styles.summaryValue, { color: colors.primary }]}>{formatINR(totalPayments)}</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: colors.dangerLight, borderColor: isDark ? colors.border : '#fca5a5' }]}>
          <Ionicons name="arrow-up-circle" size={20} color={colors.danger} />
          <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{t('customers.totalBorrowed')}</Text>
          <Text style={[styles.summaryValue, { color: colors.danger }]}>{formatINR(totalCredit)}</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.tabsContainer, { backgroundColor: colors.white, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tab, { backgroundColor: colors.surface }, filter === 'all' && styles.tabActive]}
          onPress={() => setFilter('all')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: colors.textSecondary }, filter === 'all' && styles.tabTextActive]}>
            {t('history.allChip')} ({transactions.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, { backgroundColor: colors.surface }, filter === 'payment' && styles.tabActive]}
          onPress={() => setFilter('payment')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: colors.textSecondary }, filter === 'payment' && styles.tabTextActive]}>
            {t('history.paymentsChip')} ({transactions.filter((t) => t.type === 'payment').length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, { backgroundColor: colors.surface }, filter === 'credit' && styles.tabActive]}
          onPress={() => setFilter('credit')}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: colors.textSecondary }, filter === 'credit' && styles.tabTextActive]}>
            {t('history.duesChip')} ({transactions.filter((t) => t.type === 'credit').length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading && transactions.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="receipt-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{t('history.emptyTitle')}</Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>{t('history.emptySub')}</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[3],
  },
  loadingText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
  },
  header: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[2],
    backgroundColor: COLORS.white,
  },
  headerTitle: {
    fontSize: FONT_SIZES['2xl'],
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  headerSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    backgroundColor: COLORS.white,
    gap: SPACING[3],
  },
  summaryCard: {
    flex: 1,
    padding: SPACING[3],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  summaryLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING[1],
  },
  summaryValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: 2,
  },
  tabsContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2],
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING[2],
  },
  tab: {
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  tabTextActive: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.bold,
  },
  listContent: {
    padding: SPACING[4],
    flexGrow: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING[12],
    gap: SPACING[2],
  },
  emptyTitle: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  emptySubtitle: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
  },
});

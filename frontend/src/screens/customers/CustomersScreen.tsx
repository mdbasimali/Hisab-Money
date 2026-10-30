import React, { useCallback, useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, Customer } from '../../types';
import { AppDataService } from '../../services/mockService';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../context/ThemeContext';
import { CustomerCard } from '../../components/customer/CustomerCard';
import { formatINR } from '../../utils/formatters';

import { SyncService } from '../../services/syncService';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CustomersScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { colors } = useAppTheme();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'cleared' | 'archived'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCustomers = useCallback(async () => {
    try {
      const results = await AppDataService.getCustomers({ includeArchived: true });
      setCustomers(results);
    } catch (e) {
      console.error('Failed to load customers:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCustomers();
    }, [fetchCustomers])
  );

  useEffect(() => {
    const unsubscribe = SyncService.addListener((event) => {
      // Auto-reload customers list silently when background sync completes
      if (!event.isSyncing) {
        fetchCustomers();
      }
    });
    return unsubscribe;
  }, [fetchCustomers]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchCustomers();
    setRefreshing(false);
  }, [fetchCustomers]);

  // Single-pass computation of count badges (avoids multiple filter runs)
  const counts = useMemo(() => {
    let all = 0;
    let pending = 0;
    let cleared = 0;
    let archived = 0;

    for (let i = 0; i < customers.length; i++) {
      const c = customers[i];
      if (c.isArchived) {
        archived++;
      } else {
        all++;
        if (c.balance > 0) pending++;
        else cleared++;
      }
    }

    return { all, pending, cleared, archived };
  }, [customers]);

  // Instant in-memory filtering with 0 latency
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();

    return customers.filter((c) => {
      // Filter by tab
      if (filter === 'archived') {
        if (!c.isArchived) return false;
      } else {
        if (c.isArchived) return false;
        if (filter === 'pending' && c.balance <= 0) return false;
        if (filter === 'cleared' && c.balance !== 0) return false;
      }

      // Filter by search query
      if (query) {
        const nameMatch = c.name.toLowerCase().includes(query);
        const phoneMatch = c.phone ? c.phone.includes(query) : false;
        return nameMatch || phoneMatch;
      }

      return true;
    });
  }, [customers, filter, search]);

  const totalOutstanding = useMemo(() => {
    return filtered.reduce((s, c) => s + c.balance, 0);
  }, [filtered]);

  const handleCustomerPress = useCallback(
    (customerId: string) => {
      navigation.navigate('CustomerDetails', { customerId });
    },
    [navigation]
  );

  const renderItem = useCallback(
    ({ item }: { item: Customer }) => (
      <CustomerCard customer={item} onPress={() => handleCustomerPress(item.id)} />
    ),
    [handleCustomerPress]
  );

  const keyExtractor = useCallback((item: Customer) => item.id, []);

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.white }]}>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('customers.title')}</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('AddCustomer')}
          activeOpacity={0.65}
          delayPressIn={0}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="add" size={24} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.white }]}>
        <View style={[styles.searchBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.textPrimary }]}
            placeholder={t('common.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
            spellCheck={false}
            autoCapitalize="none"
          />
          {search ? (
            <TouchableOpacity
              onPress={() => setSearch('')}
              delayPressIn={0}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={[styles.filtersContainer, { backgroundColor: colors.white, borderBottomColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: colors.surface }, filter === 'all' && styles.filterChipActive]}
          onPress={() => setFilter('all')}
          activeOpacity={0.7}
          delayPressIn={0}
        >
          <Text style={[styles.filterText, { color: colors.textSecondary }, filter === 'all' && styles.filterTextActive]}>
            {t('common.all')} ({counts.all})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: colors.surface }, filter === 'pending' && styles.filterChipActive]}
          onPress={() => setFilter('pending')}
          activeOpacity={0.7}
          delayPressIn={0}
        >
          <Text style={[styles.filterText, { color: colors.textSecondary }, filter === 'pending' && styles.filterTextActive]}>
            {t('common.pending')} ({counts.pending})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: colors.surface }, filter === 'cleared' && styles.filterChipActive]}
          onPress={() => setFilter('cleared')}
          activeOpacity={0.7}
          delayPressIn={0}
        >
          <Text style={[styles.filterText, { color: colors.textSecondary }, filter === 'cleared' && styles.filterTextActive]}>
            {t('common.cleared')} ({counts.cleared})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: colors.surface }, filter === 'archived' && styles.filterChipActive]}
          onPress={() => setFilter('archived')}
          activeOpacity={0.7}
          delayPressIn={0}
        >
          <Text style={[styles.filterText, { color: colors.textSecondary }, filter === 'archived' && styles.filterTextActive]}>
            {t('common.archived')} ({counts.archived})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Outstanding banner */}
      <View style={[styles.banner, { backgroundColor: colors.primaryLighter, borderBottomColor: colors.primaryLight }]}>
        <Text style={[styles.bannerText, { color: colors.primaryDark }]}>
          {t('customers.totalDueBanner', { amount: formatINR(totalOutstanding) })}
        </Text>
        <Text style={[styles.bannerSub, { color: colors.textSecondary }]}>
          {t('customers.customerCount', { count: filtered.length })}
        </Text>
      </View>

      {/* List */}
      {loading && customers.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('customers.fetchingAccounts')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={colors.textMuted} />
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                {search ? t('customers.noMatching') : t('customers.emptyList')}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
                {search
                  ? t('customers.noMatchingSub', { query: search })
                  : t('customers.emptyListSub')}
              </Text>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    backgroundColor: COLORS.white,
  },
  headerTitle: {
    fontSize: FONT_SIZES['2xl'],
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchContainer: {
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2],
    backgroundColor: COLORS.white,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    borderWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING[2],
  },
  searchInput: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    padding: 0,
  },
  filtersContainer: {
    flexDirection: 'row',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2],
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING[2],
  },
  filterChip: {
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
  },
  filterText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  filterTextActive: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.bold,
  },
  banner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[2],
    backgroundColor: COLORS.primaryLighter,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.primaryLight,
  },
  bannerText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primaryDark,
    fontWeight: FONT_WEIGHTS.medium,
  },
  bannerAmount: {
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
  },
  bannerSub: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
  },
  listContent: {
    padding: SPACING[4],
    flexGrow: 1,
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
    textAlign: 'center',
  },
});

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { DashboardSummary, RootStackParamList } from '../../types';
import { AppDataService } from '../../services/mockService';
import { AuthService } from '../../services/authService';
import { GoogleDriveBackupService } from '../../services/googleDriveService';
import { ContactsService, ContactsPermissionStatus } from '../../services/contactsService';
import { ContactsPermissionModal } from '../../components/contacts/ContactsPermissionModal';
import { ContactSearchSection } from '../../components/contacts/ContactSearchSection';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { formatINR } from '../../utils/formatters';
import { useAppTheme } from '../../context/ThemeContext';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export function DashboardScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { isDark, colors } = useAppTheme();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(true);
  const [userName, setUserName] = useState<string>(() => {
    const cached = AuthService.getCachedUser();
    return cached?.name || AppDataService.getUser().name;
  });
  const [permissionStatus, setPermissionStatus] = useState<ContactsPermissionStatus>('undetermined');
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);

  const checkContactsPermissionAndOnboarding = useCallback(async () => {
    try {
      const status = await ContactsService.checkPermission();
      setPermissionStatus(status);

      const seen = await ContactsService.hasSeenOnboarding();
      if (!seen) {
        setShowOnboardingModal(true);
      }
    } catch (e) {
      console.warn('[DashboardScreen] Contacts permission check error:', e);
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      const data = await AppDataService.getDashboardSummary();
      setSummary(data);

      const authUser = await AuthService.getUser();
      if (authUser?.name) {
        setUserName(authUser.name);
      }

      const connected = await GoogleDriveBackupService.isDriveConnected();
      setIsDriveConnected(connected);
    } catch (e) {
      console.error('Failed to load dashboard summary:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
      checkContactsPermissionAndOnboarding();
    }, [loadData, checkContactsPermissionAndOnboarding])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
    checkContactsPermissionAndOnboarding();
  }, [loadData, checkContactsPermissionAndOnboarding]);

  const handleAllowContacts = async () => {
    setShowOnboardingModal(false);
    await ContactsService.setOnboardingSeen(true);
    const status = await ContactsService.requestPermission();
    setPermissionStatus(status);
  };

  const handleMaybeLaterContacts = async () => {
    setShowOnboardingModal(false);
    await ContactsService.setOnboardingSeen(true);
  };

  const handleRequestPermissionFromSearch = async () => {
    const status = await ContactsService.requestPermission();
    setPermissionStatus(status);
    if (status !== 'granted') {
      Alert.alert(
        t('contacts.permissionDeniedTitle', 'Permission Required'),
        t('contacts.permissionDeniedMsg', 'Contacts access is disabled. Please enable it in Settings to search your phone contacts.'),
        [
          { text: t('common.cancel', 'Cancel'), style: 'cancel' },
          {
            text: t('contacts.openSettings', 'Open Settings'),
            onPress: () => {
              if (Platform.OS === 'android' || Platform.OS === 'ios') {
                Linking.openSettings().catch(() => {});
              }
            },
          },
        ]
      );
    }
  };

  const handleSelectContact = (name: string, phone: string) => {
    navigation.navigate('AddCustomer', {
      initialName: name,
      initialPhone: phone,
    });
  };

  const handleViewExistingCustomer = (customerId: string) => {
    navigation.navigate('CustomerDetails', { customerId });
  };

  const user = AppDataService.getUser();

  if (loading && !summary) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const currentSummary = summary || {
    totalOutstanding: 0,
    totalOutstandingPaise: 0,
    totalCollected: 0,
    totalCollectedPaise: 0,
    totalCustomers: 0,
    customersWithBalance: 0,
    recentTransactions: [],
    totalCollectedToday: 0,
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* Top Header */}
        <View style={styles.topHeader}>
          <View>
            <Text style={[styles.greeting, { color: colors.textSecondary }]}>{t('dashboard.greeting')}</Text>
            <Text style={[styles.businessName, { color: colors.textPrimary }]} numberOfLines={1}>
              {userName || user.name || 'Hisab Money'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addFab}
            onPress={() => navigation.navigate('AddCustomer')}
            activeOpacity={0.75}
            delayPressIn={0}
            hitSlop={8}
          >
            <Ionicons name="person-add" size={22} color={COLORS.white} />
          </TouchableOpacity>
        </View>

        {/* Compact Customer Contact Search Bar (Immediately below greeting and above Total Outstanding) */}
        <ContactSearchSection
          permissionStatus={permissionStatus}
          onRequestPermission={handleRequestPermissionFromSearch}
          onSelectContact={handleSelectContact}
          onViewExistingCustomer={handleViewExistingCustomer}
        />

        {/* Cloud Backup Waiting for Drive Authorization Banner */}
        {!isDriveConnected && (
          <View
            style={[
              styles.driveBannerCard,
              {
                backgroundColor: isDark ? '#1c1917' : '#fffbeb',
                borderColor: isDark ? '#b45309' : '#fde68a',
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="cloud-offline-outline" size={24} color={isDark ? '#fbbf24' : '#d97706'} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.driveBannerTitle, { color: isDark ? '#fef3c7' : '#92400e' }]}>
                  Cloud Backup Waiting for Authorization
                </Text>
                <Text style={[styles.driveBannerSubtitle, { color: isDark ? '#d6d3d1' : '#b45309' }]}>
                  Connect Google Drive to enable automatic cloud backup of your ledger records.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.driveBannerBtn}
              onPress={() => (navigation as any).navigate('Settings')}
              activeOpacity={0.8}
            >
              <Text style={styles.driveBannerBtnText}>Connect Google Drive</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Hero Balance Card */}
        <View style={styles.heroCard}>
          <View style={styles.heroCardInner}>
            <Text style={styles.heroLabel}>{t('dashboard.totalOutstanding')}</Text>
            <Text style={styles.heroAmount}>{formatINR(currentSummary.totalOutstanding)}</Text>
            <View style={styles.heroStats}>
              <View style={styles.heroStat}>
                <Ionicons name="people-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroStatText}>
                  {t('dashboard.pendingCustomers', {
                    pending: currentSummary.customersWithBalance,
                    total: currentSummary.totalCustomers,
                  })}
                </Text>
              </View>
              <View style={styles.heroDivider} />
              <View style={styles.heroStat}>
                <Ionicons name="shield-checkmark-outline" size={14} color="rgba(255,255,255,0.8)" />
                <Text style={styles.heroStatText}>{t('dashboard.sqliteSecured')}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.surfaceCard, borderColor: isDark ? colors.border : '#e2e8f0', borderWidth: isDark ? 1 : 0, borderLeftColor: colors.primary }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('dashboard.collectedToday')}</Text>
            <Text style={[styles.statValue, { color: colors.primary }]}>
              {formatINR(currentSummary.totalCollectedToday)}
            </Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.surfaceCard, borderColor: isDark ? colors.border : '#e2e8f0', borderWidth: isDark ? 1 : 0, borderLeftColor: isDark ? '#4ade80' : COLORS.primaryDark }]}>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{t('dashboard.totalCollected')}</Text>
            <Text style={[styles.statValue, { color: isDark ? '#4ade80' : COLORS.primaryDark }]}>
              {formatINR(currentSummary.totalCollected)}
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('dashboard.quickActions')}</Text>
        </View>
        <View style={styles.quickActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('AddCustomer')}
            activeOpacity={0.7}
            delayPressIn={0}
            hitSlop={6}
          >
            <View style={[styles.actionIcon, { backgroundColor: isDark ? '#082f49' : '#e0f2fe' }]}>
              <Ionicons name="person-add" size={22} color={isDark ? '#38bdf8' : '#0284c7'} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{t('dashboard.addCustomer')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Customers' })}
            activeOpacity={0.7}
            delayPressIn={0}
            hitSlop={6}
          >
            <View style={[styles.actionIcon, { backgroundColor: isDark ? '#064e3b' : '#dcfce7' }]}>
              <Ionicons name="cash-outline" size={22} color={isDark ? '#4ade80' : '#16a34a'} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{t('dashboard.recordPayment')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('MainTabs', { screen: 'History' })}
            activeOpacity={0.7}
            delayPressIn={0}
            hitSlop={6}
          >
            <View style={[styles.actionIcon, { backgroundColor: isDark ? '#451a03' : '#fef3c7' }]}>
              <Ionicons name="receipt-outline" size={22} color={isDark ? '#fbbf24' : '#d97706'} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{t('dashboard.transactions')}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => navigation.navigate('MainTabs', { screen: 'Customers' })}
            activeOpacity={0.7}
            delayPressIn={0}
            hitSlop={6}
          >
            <View style={[styles.actionIcon, { backgroundColor: isDark ? '#2e1065' : '#ede9fe' }]}>
              <Ionicons name="people-outline" size={22} color={isDark ? '#a78bfa' : '#7c3aed'} />
            </View>
            <Text style={[styles.actionLabel, { color: colors.textPrimary }]}>{t('dashboard.allAccounts')}</Text>
          </TouchableOpacity>
        </View>

        {/* Rebalanced Info Banner */}
        <View style={[styles.infoBanner, { backgroundColor: colors.surfaceCard, borderColor: isDark ? colors.border : '#e2e8f0' }]}>
          <View style={[styles.infoIconWrapper, { backgroundColor: isDark ? '#064e3b' : '#dcfce7' }]}>
            <Ionicons name="shield-checkmark" size={24} color={colors.primary} />
          </View>
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, { color: colors.textPrimary }]}>{t('dashboard.emptyTitle')}</Text>
            <Text style={[styles.infoSubtitle, { color: colors.textSecondary }]}>{t('dashboard.emptySubtitle')}</Text>
          </View>
        </View>
      </ScrollView>

      {/* First App Launch Contacts Permission Explanation Modal */}
      <ContactsPermissionModal
        visible={showOnboardingModal}
        onAllow={handleAllowContacts}
        onMaybeLater={handleMaybeLaterContacts}
      />
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
  scroll: {
    flex: 1,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[2],
  },
  greeting: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  businessName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  addFab: {
    backgroundColor: COLORS.primary,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  fabPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.94 }],
  },
  heroCard: {
    marginHorizontal: SPACING[4],
    marginVertical: SPACING[3],
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS['2xl'],
    padding: SPACING[5],
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 6,
  },
  heroCardInner: {
    alignItems: 'center',
  },
  heroLabel: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255,255,255,0.8)',
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: SPACING[1],
  },
  heroAmount: {
    fontSize: FONT_SIZES['3xl'],
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.white,
    letterSpacing: -0.5,
  },
  heroStats: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING[3],
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: RADIUS.full,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[1],
  },
  heroStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  heroStatText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.medium,
  },
  heroDivider: {
    width: 1,
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: SPACING[3],
  },
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING[4],
    gap: SPACING[3],
    marginBottom: SPACING[4],
  },
  statCard: {
    flex: 1,
    backgroundColor: COLORS.white,
    padding: SPACING[3],
    borderRadius: RADIUS.lg,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  statLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  statValue: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING[4],
    marginBottom: SPACING[3],
  },
  sectionTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  seeAll: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    marginBottom: SPACING[6],
  },
  actionBtn: {
    alignItems: 'center',
    width: '23%',
  },
  actionBtnPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.94 }],
  },
  actionIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[1],
  },
  actionLabel: {
    fontSize: 11,
    color: COLORS.textPrimary,
    textAlign: 'center',
    fontWeight: FONT_WEIGHTS.medium,
  },
  scrollContent: {
    paddingBottom: SPACING[8],
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING[4],
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: SPACING[3],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  infoIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  infoSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    lineHeight: 16,
  },
  driveBannerCard: {
    marginHorizontal: SPACING[4],
    marginBottom: SPACING[3],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING[3],
    gap: SPACING[2],
  },
  driveBannerTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  driveBannerSubtitle: {
    fontSize: FONT_SIZES.xs,
    lineHeight: 16,
    marginTop: 2,
  },
  driveBannerBtn: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING[2],
    paddingHorizontal: SPACING[3],
    borderRadius: RADIUS.md,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  driveBannerBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

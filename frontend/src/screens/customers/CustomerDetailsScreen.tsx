import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Customer, Transaction } from '../../types';
import { AppDataService } from '../../services/mockService';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { formatINR, formatDateTime, getInitials } from '../../utils/formatters';
import { TransactionItem } from '../../components/customer/TransactionItem';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { SmsModal } from '../../components/common/SmsModal';
import { CustomerPdfModal } from '../../components/customer/CustomerPdfModal';
import { useAppTheme } from '../../context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'CustomerDetails'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function CustomerDetailsScreen({ route }: Props) {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { isDark, colors } = useAppTheme();
  const { customerId } = route.params;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const loadCustomer = useCallback(async () => {
    try {
      const [c, txs] = await Promise.all([
        AppDataService.getCustomerById(customerId),
        AppDataService.getTransactionsByCustomer(customerId),
      ]);
      setCustomer(c);
      setTransactions(txs);
    } catch (e) {
      console.error('Failed to load customer:', e);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useFocusEffect(
    useCallback(() => {
      loadCustomer();
    }, [loadCustomer])
  );

  const handleToggleArchive = () => {
    if (!customer) return;
    const isCurrentlyArchived = customer.isArchived;

    Alert.alert(
      isCurrentlyArchived
        ? t('customers.unarchiveConfirmTitle')
        : t('customers.archiveConfirmTitle'),
      isCurrentlyArchived
        ? t('customers.unarchiveConfirmMsg', { name: customer.name })
        : t('customers.archiveConfirmMsg', { name: customer.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: isCurrentlyArchived ? t('customers.unarchiveAccountBtn') : t('customers.archiveAccountBtn'),
          style: isCurrentlyArchived ? 'default' : 'destructive',
          onPress: async () => {
            try {
              await AppDataService.archiveCustomer(customer.id, !isCurrentlyArchived);
              loadCustomer();
            } catch (e) {
              Alert.alert(t('common.error'), 'Failed to update customer status');
            }
          },
        },
      ]
    );
  };

  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [pdfModalVisible, setPdfModalVisible] = useState(false);

  const handleSendSMS = () => {
    if (!customer) return;
    if (!customer.phone) {
      Alert.alert(
        'Missing Phone Number',
        'This customer does not have a phone number saved. Please tap "Edit Profile" to add a mobile number before sending an SMS reminder.',
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: 'Edit Profile',
            onPress: () => navigation.navigate('EditCustomer', { customerId: customer.id }),
          },
        ]
      );
      return;
    }
    setSmsModalVisible(true);
  };

  if (loading && !customer) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!customer) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <Text style={{ textAlign: 'center', color: colors.textSecondary }}>{t('customers.customerNotFound')}</Text>
          <Button title={t('common.goBack')} onPress={() => navigation.goBack()} variant="outline" size="sm" />
        </View>
      </SafeAreaView>
    );
  }

  const isCleared = customer.balance === 0;

  const avatarColors = ['#16a34a', '#0891b2', '#7c3aed', '#db2777', '#d97706', '#dc2626'];
  const avatarBg = avatarColors[customer.name.charCodeAt(0) % avatarColors.length];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.primary }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.65} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={COLORS.white} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{t('customers.customerDetailsTitle')}</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => setPdfModalVisible(true)}
            style={styles.headerBtn}
            activeOpacity={0.65}
            hitSlop={6}
            accessibilityLabel="Download PDF Report"
          >
            <Ionicons name="document-text-outline" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('EditCustomer', { customerId: customer.id })} style={styles.headerBtn} activeOpacity={0.65} hitSlop={6}>
            <Ionicons name="create-outline" size={22} color={COLORS.white} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleToggleArchive} style={styles.headerBtn} activeOpacity={0.65} hitSlop={6}>
            <Ionicons
              name={customer.isArchived ? 'archive' : 'archive-outline'}
              size={22}
              color={COLORS.white}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: customer.isArchived ? (isDark ? colors.border : COLORS.textSecondary) : colors.primary }]}>
          <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
            <Text style={styles.avatarText}>{getInitials(customer.name)}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.customerName}>{customer.name}</Text>
            {customer.isArchived && <Badge label={t('common.archived')} variant="neutral" />}
          </View>
          <Text style={styles.customerPhone}>{customer.phone || 'No phone number'}</Text>
          {customer.address ? (
            <View style={styles.profileMeta}>
              <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.metaText} numberOfLines={1}>{customer.address}</Text>
            </View>
          ) : null}
          {customer.notes ? (
            <View style={styles.profileMeta}>
              <Ionicons name="document-text-outline" size={14} color="rgba(255,255,255,0.8)" />
              <Text style={styles.metaText} numberOfLines={1}>{customer.notes}</Text>
            </View>
          ) : null}
          <Text style={styles.joinDate}>
            {t('customers.customerSince', { date: formatDateTime(customer.createdAt, i18n.language) })}
          </Text>
        </View>

        {/* Balance Card */}
        <View style={[styles.balanceCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
          <View style={[styles.balanceRow, { borderBottomColor: colors.borderLight }]}>
            <View style={styles.balanceBlock}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('customers.outstandingDue')}</Text>
              <Text style={[styles.balanceValue, { color: isCleared ? colors.primary : colors.danger }]}>
                {formatINR(customer.balance)}
              </Text>
            </View>
            <View style={[styles.balanceDivider, { backgroundColor: colors.borderLight }]} />
            <View style={styles.balanceBlock}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('customers.totalBorrowed')}</Text>
              <Text style={[styles.balanceValue, { color: colors.textPrimary }]}>{formatINR(customer.totalCredit)}</Text>
            </View>
            <View style={[styles.balanceDivider, { backgroundColor: colors.borderLight }]} />
            <View style={styles.balanceBlock}>
              <Text style={[styles.balanceLabel, { color: colors.textSecondary }]}>{t('customers.totalPaid')}</Text>
              <Text style={[styles.balanceValue, { color: colors.primary }]}>
                {formatINR(customer.totalPaid)}
              </Text>
            </View>
          </View>

          {/* Opening vs New Dues breakdown if customer has opening balance or new dues */}
          {((customer.openingBalancePaise ?? 0) > 0 || (customer.totalNewDues ?? 0) > 0) && (
            <View style={[styles.duesBreakdown, { backgroundColor: isDark ? colors.surface : '#fffbeb', borderColor: isDark ? colors.border : '#fef3c7' }]}>
              <Text style={[styles.duesBreakdownText, { color: colors.gold }]}>
                {t('customers.openingBreakdown', {
                  opening: formatINR(customer.openingBalance ?? (customer.openingBalancePaise ? customer.openingBalancePaise / 100 : 0)),
                  newDues: formatINR(customer.totalNewDues ?? 0),
                })}
              </Text>
            </View>
          )}

          {/* Account status badge */}
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: SPACING[3] }}>
            <Badge
              label={isCleared ? t('common.allCleared') : t('common.paymentDue')}
              variant={isCleared ? 'success' : 'warning'}
              dot
            />
          </View>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <Button
            title={t('customers.addNewDueBtn')}
            onPress={() => navigation.navigate('AddNewDue', { customerId: customer.id })}
            variant="secondary"
            size="md"
            disabled={customer.isArchived}
            icon={<Ionicons name="cart-outline" size={18} color={colors.danger} />}
          />
          <Button
            title={t('customers.recordPaymentBtn')}
            onPress={() => {
              if (customer.balance <= 0) {
                Alert.alert(
                  t('customers.fullyClearedAlertTitle'),
                  t('customers.fullyClearedAlertMsg', { name: customer.name })
                );
                return;
              }
              navigation.navigate('RecordPayment', { customerId: customer.id });
            }}
            variant="primary"
            size="md"
            disabled={customer.isArchived}
            icon={<Ionicons name="cash-outline" size={18} color={COLORS.white} />}
          />
        </View>

        <View style={styles.secondaryActionRow}>
          <TouchableOpacity
            style={styles.editActionBtn}
            onPress={() => navigation.navigate('EditCustomer', { customerId: customer.id })}
            activeOpacity={0.65}
            hitSlop={6}
          >
            <Ionicons name="create-outline" size={16} color={colors.primary} />
            <Text style={[styles.editActionText, { color: colors.primary }]}>{t('customers.editProfileBtn')}</Text>
          </TouchableOpacity>
          <Text style={{ color: colors.textMuted }}>•</Text>
          <TouchableOpacity
            style={styles.smsActionBtn}
            onPress={handleSendSMS}
            activeOpacity={0.65}
            hitSlop={6}
          >
            <Ionicons name="chatbubble-outline" size={16} color={colors.primary} />
            <Text style={[styles.smsActionText, { color: colors.primary, fontWeight: '600' }]}>Send SMS</Text>
          </TouchableOpacity>
        </View>

        {/* Download PDF Ledger Report Action */}
        <View style={styles.pdfActionContainer}>
          <TouchableOpacity
            style={[
              styles.pdfActionBtn,
              {
                backgroundColor: colors.surfaceCard,
                borderColor: colors.border,
                borderWidth: isDark ? 1 : StyleSheet.hairlineWidth,
              },
            ]}
            onPress={() => setPdfModalVisible(true)}
            activeOpacity={0.75}
          >
            <View style={[styles.pdfIconCircle, { backgroundColor: isDark ? '#064e3b' : '#dcfce7' }]}>
              <Ionicons name="document-text" size={18} color={colors.primary} />
            </View>
            <View style={styles.pdfTextContainer}>
              <Text style={[styles.pdfActionTitle, { color: colors.textPrimary }]}>
                {t('customers.downloadPdfReport', 'Download PDF Report')}
              </Text>
              <Text style={[styles.pdfActionSubtitle, { color: colors.textSecondary }]}>
                {t('customers.downloadPdfSubtitle', 'Official ledger statement with date filters & running balance')}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Transaction History */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>{t('customers.paymentCreditHistory')}</Text>
          <Text style={[styles.txCount, { color: colors.textMuted }]}>
            {t('history.showingCount', { count: transactions.length })}
          </Text>
        </View>

        <View style={[styles.transactionsCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
          {transactions.length === 0 ? (
            <Text style={[styles.noTx, { color: colors.textMuted }]}>{t('customers.noHistoryTitle')}</Text>
          ) : (
            transactions.map((tx) => (
              <TransactionItem key={tx.id} transaction={tx} />
            ))
          )}
        </View>

        <View style={{ height: SPACING[8] }} />
      </ScrollView>

      {customer && (
        <SmsModal
          visible={smsModalVisible}
          onClose={() => setSmsModalVisible(false)}
          customerName={customer.name}
          phoneNumber={customer.phone}
          outstandingBalanceRupees={customer.balance}
          initialType="REMINDER"
        />
      )}

      {customer && (
        <CustomerPdfModal
          visible={pdfModalVisible}
          onClose={() => setPdfModalVisible(false)}
          customer={customer}
          transactions={transactions}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.surface },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
  },
  backBtn: {
    padding: SPACING[1],
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  headerBtn: {
    padding: SPACING[1],
  },
  headerTitle: {
    flex: 1,
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
    textAlign: 'center',
  },
  profileCard: {
    alignItems: 'center',
    paddingVertical: SPACING[6],
    paddingHorizontal: SPACING[5],
    overflow: 'hidden',
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.4)',
    marginBottom: SPACING[3],
  },
  avatarText: {
    fontSize: FONT_SIZES['2xl'],
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  customerName: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  customerPhone: {
    fontSize: FONT_SIZES.sm,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  profileMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  metaText: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.8)',
    maxWidth: 260,
  },
  joinDate: {
    fontSize: FONT_SIZES.xs,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 6,
  },
  balanceCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING[4],
    marginTop: -SPACING[4],
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: SPACING[3],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  balanceBlock: {
    alignItems: 'center',
    flex: 1,
  },
  balanceDivider: {
    width: 1,
    height: 36,
    backgroundColor: COLORS.borderLight,
  },
  balanceLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  balanceValue: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  creditSection: {
    paddingTop: SPACING[3],
  },
  creditRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING[2],
  },
  creditLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  progressBar: {
    height: 6,
    backgroundColor: COLORS.borderLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  creditUsed: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 4,
    textAlign: 'right',
  },
  duesBreakdown: {
    backgroundColor: '#fffbeb',
    borderRadius: RADIUS.md,
    paddingVertical: SPACING[1],
    paddingHorizontal: SPACING[3],
    marginTop: SPACING[2],
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#fef3c7',
  },
  duesBreakdownText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.gold,
    fontWeight: FONT_WEIGHTS.medium,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING[3],
    paddingHorizontal: SPACING[4],
    marginTop: SPACING[4],
  },
  secondaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACING[3],
    marginTop: SPACING[3],
  },
  editActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING[1],
  },
  editActionText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  smsActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: SPACING[1],
  },
  smsActionText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  pdfActionContainer: {
    paddingHorizontal: SPACING[4],
    marginTop: SPACING[3],
  },
  pdfActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING[2] + 2,
    paddingHorizontal: SPACING[3],
    borderRadius: RADIUS.lg,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  pdfIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING[3],
  },
  pdfTextContainer: {
    flex: 1,
  },
  pdfActionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  pdfActionSubtitle: {
    fontSize: FONT_SIZES.xs - 1,
    marginTop: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING[4],
    marginTop: SPACING[5],
    marginBottom: SPACING[2],
  },
  sectionTitle: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  txCount: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
  },
  transactionsCard: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING[4],
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING[3],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  noTx: {
    textAlign: 'center',
    paddingVertical: SPACING[6],
    color: COLORS.textMuted,
    fontSize: FONT_SIZES.sm,
  },
});

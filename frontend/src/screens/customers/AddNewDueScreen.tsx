import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, Customer, AddNewDueFormData } from '../../types';
import { AppDataService } from '../../services/mockService';
import { rupeesToPaise } from '../../utils/currency';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import { formatINR, getInitials } from '../../utils/formatters';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { SmsModal } from '../../components/common/SmsModal';
import { useAppTheme } from '../../context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'AddNewDue'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

const COMMON_REASONS = [
  'Groceries',
  'Medicine',
  'Personal Loan',
  'Hardware Supplies',
  'Daily Essentials',
  'Wholesale Goods',
];

const schema = z.object({
  amount: z
    .string()
    .min(1, 'Amount is required')
    .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount (e.g. 1000 or 1500.50)')
    .refine((v) => parseFloat(v) > 0, 'Amount must be greater than ₹0')
    .refine((v) => parseFloat(v) <= 1000000, 'Due amount cannot exceed ₹10,00,000'),
  reason: z
    .string()
    .min(2, 'Reason is required (at least 2 characters)')
    .max(100, 'Reason too long'),
  transactionDate: z.string().min(10, 'Valid date required (YYYY-MM-DD)'),
  notes: z.string().max(250, 'Notes too long').optional(),
});

function DueBalancePreview({
  control,
  customerBalance,
  t,
}: {
  control: any;
  customerBalance: number;
  t: any;
}) {
  const { colors, isDark } = useAppTheme();
  const amountVal = useWatch({ control, name: 'amount' });
  const amountNum = parseFloat(amountVal || '0') || 0;
  if (amountNum <= 0) return null;
  const newProjectedBalance = customerBalance + amountNum;

  return (
    <View style={[styles.previewBox, { backgroundColor: isDark ? colors.surface : COLORS.dangerLight, borderColor: isDark ? colors.border : '#fecaca' }]}>
      <Ionicons name="trending-up" size={16} color={colors.danger} />
      <Text style={[styles.previewText, { color: colors.textSecondary }]}>
        {t('newDue.newOutstanding')}:{' '}
        <Text style={{ fontWeight: FONT_WEIGHTS.bold, color: colors.danger }}>
          {formatINR(newProjectedBalance)}
        </Text>
      </Text>
    </View>
  );
}

export function AddNewDueScreen({ route }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { colors, isDark } = useAppTheme();
  const { customerId } = route.params;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [addedDueAmount, setAddedDueAmount] = useState(0);
  const [newBalance, setNewBalance] = useState(0);

  const now = new Date();
  const localYear = now.getFullYear();
  const localMonth = String(now.getMonth() + 1).padStart(2, '0');
  const localDay = String(now.getDate()).padStart(2, '0');
  const todayStr = `${localYear}-${localMonth}-${localDay}`;

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AddNewDueFormData>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
    defaultValues: {
      amount: '',
      reason: '',
      transactionDate: todayStr,
      notes: '',
    },
  });

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const c = await AppDataService.getCustomerById(customerId);
        if (isMounted) setCustomer(c);
      } catch (e) {
        Alert.alert(t('common.error'), 'Failed to load customer');
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [customerId, t]);

  const onSubmit = async (data: AddNewDueFormData) => {
    if (!customer || loading) return;

    const amountNum = parseFloat(data.amount || '0') || 0;
    setLoading(true);
    try {
      const amountPaise = rupeesToPaise(data.amount);

      const currentTime = new Date();
      let isoDate = currentTime.toISOString();

      if (data.transactionDate && data.transactionDate.trim()) {
        const inputDateStr = data.transactionDate.trim();
        const curYear = currentTime.getFullYear();
        const curMonth = String(currentTime.getMonth() + 1).padStart(2, '0');
        const curDay = String(currentTime.getDate()).padStart(2, '0');
        const curTodayStr = `${curYear}-${curMonth}-${curDay}`;

        if (inputDateStr === curTodayStr) {
          // Real-time recording for today: capture exact current second & millisecond
          isoDate = currentTime.toISOString();
        } else {
          // Custom day: preserve current hours, minutes, and seconds for natural ordering
          const [year, month, day] = inputDateStr.split('-').map(Number);
          if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
            const customDate = new Date(
              year,
              month - 1,
              day,
              currentTime.getHours(),
              currentTime.getMinutes(),
              currentTime.getSeconds(),
              currentTime.getMilliseconds()
            );
            isoDate = customDate.toISOString();
          }
        }
      }

      await AppDataService.addNewDue({
        customerId: customer.id,
        amountPaise,
        reason: data.reason.trim(),
        transactionDate: isoDate,
        notes: data.notes?.trim() || undefined,
      });

      const updatedBalance = (customer.balance || 0) + amountNum;
      setAddedDueAmount(amountNum);
      setNewBalance(updatedBalance);

      Alert.alert(
        t('newDue.savedSuccessTitle'),
        t('newDue.savedSuccessMsg', {
          amount: formatINR(amountNum),
          name: customer.name,
        }),
        [
          { text: t('common.done'), onPress: () => navigation.goBack() },
          ...(customer.phone
            ? [
                {
                  text: t('common.sendSms'),
                  onPress: () => setSmsModalVisible(true),
                },
              ]
            : []),
        ]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to add due transaction';
      Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  if (initialLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!customer) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.centerContainer}>
          <Text style={{ textAlign: 'center', marginTop: 40, color: colors.textSecondary }}>{t('customers.customerNotFound')}</Text>
          <Button title={t('common.goBack')} onPress={() => navigation.goBack()} variant="outline" size="sm" />
        </View>
      </SafeAreaView>
    );
  }

  const avatarColors = ['#16a34a', '#0891b2', '#7c3aed', '#db2777', '#d97706', '#dc2626'];
  const avatarBg = avatarColors[customer.name.charCodeAt(0) % avatarColors.length];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.white, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('newDue.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          removeClippedSubviews={false}
        >
          {/* Customer info card */}
          <View style={[styles.customerCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
            <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
              <Text style={styles.avatarText}>{getInitials(customer.name)}</Text>
            </View>
            <View style={styles.customerInfo}>
              <Text style={[styles.customerName, { color: colors.textPrimary }]}>{customer.name}</Text>
              <Text style={[styles.customerPhone, { color: colors.textSecondary }]}>{customer.phone || 'No phone'}</Text>
            </View>
            <View style={styles.balanceChip}>
              <Text style={styles.balanceChipLabel}>{t('customers.outstandingDue')}</Text>
              <Text style={styles.balanceChipAmount}>{formatINR(customer.balance)}</Text>
            </View>
          </View>

          {/* Form */}
          <View style={[styles.formCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
            <Text style={[styles.sectionHeading, { color: colors.primary }]}>{t('newDue.dueDetailsSection')}</Text>

            <Controller
              control={control}
              name="amount"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('newDue.amountLabel')}
                  placeholder={t('newDue.amountPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.amount?.message}
                  keyboardType="numeric"
                  prefix="₹"
                  hint={t('newDue.newDueAmount')}
                  autoCorrect={false}
                  spellCheck={false}
                />
              )}
            />

            {/* Live New Balance Preview (Isolated sub-component: does not re-render inputs) */}
            <DueBalancePreview control={control} customerBalance={customer.balance} t={t} />

            <Controller
              control={control}
              name="reason"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('newDue.reasonLabel')}
                  placeholder={t('newDue.reasonPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.reason?.message}
                />
              )}
            />

            {/* Quick Reason Chips */}
            <Text style={[styles.quickLabel, { color: colors.textSecondary }]}>{t('newDue.commonReasons')}</Text>
            <View style={styles.chipRow}>
              {COMMON_REASONS.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.chip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  onPress={() => setValue('reason', r, { shouldValidate: true })}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.chipText, { color: colors.textSecondary }]}>{r}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Controller
              control={control}
              name="transactionDate"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={`${t('newDue.transactionDateLabel')} (YYYY-MM-DD) *`}
                  placeholder={todayStr}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.transactionDate?.message}
                />
              )}
            />

            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('newDue.notesLabel')}
                  placeholder={t('newDue.notesPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.notes?.message}
                  multiline
                  numberOfLines={2}
                />
              )}
            />
          </View>

          {/* Action buttons */}
          <View style={styles.buttonContainer}>
            <Button
              title={loading ? t('newDue.savingDueBtn') : t('newDue.saveDueBtn')}
              onPress={handleSubmit(onSubmit)}
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              disabled={loading}
              icon={<Ionicons name="add-circle-outline" size={20} color={COLORS.white} />}
            />
            <Button
              title={t('common.cancel')}
              onPress={() => navigation.goBack()}
              variant="outline"
              size="md"
              fullWidth
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {customer && (
        <SmsModal
          visible={smsModalVisible}
          onClose={() => {
            setSmsModalVisible(false);
            navigation.goBack();
          }}
          customerName={customer.name}
          phoneNumber={customer.phone}
          outstandingBalanceRupees={newBalance}
          transactionAmountRupees={addedDueAmount}
          initialType="DUE_ADDED"
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  centerContainer: {
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
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: { padding: SPACING[1] },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  scrollContent: {
    padding: SPACING[4],
    paddingBottom: Platform.OS === 'android' ? 64 : 40,
  },

  // Customer Card
  customerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING[3],
    marginBottom: SPACING[3],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  avatarText: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  customerInfo: { flex: 1 },
  customerName: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  customerPhone: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  balanceChip: {
    alignItems: 'flex-end',
    backgroundColor: COLORS.warningLight,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.md,
  },
  balanceChipLabel: {
    fontSize: 10,
    color: COLORS.gold,
    fontWeight: FONT_WEIGHTS.medium,
  },
  balanceChipAmount: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.gold,
  },

  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
    marginBottom: SPACING[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeading: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING[3],
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff1f2',
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    marginBottom: SPACING[3],
    gap: SPACING[2],
  },
  previewText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    flex: 1,
  },
  quickLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING[2],
    fontWeight: FONT_WEIGHTS.medium,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[2],
    marginBottom: SPACING[4],
  },
  chip: {
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.full,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chipText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textPrimary,
  },
  buttonContainer: {
    gap: SPACING[3],
    marginTop: SPACING[2],
    marginBottom: SPACING[8],
  },
});

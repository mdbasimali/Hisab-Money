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
import type { RootStackParamList, Customer, RecordPaymentFormData } from '../../types';

function PaymentRemainingPreview({
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
  if (amountNum <= 0 || amountNum > customerBalance) return null;
  const remainingAfter = Math.max(0, customerBalance - amountNum);

  return (
    <View style={[styles.preview, { backgroundColor: isDark ? colors.surface : '#eff6ff', borderColor: isDark ? colors.border : '#bfdbfe' }]}>
      <Ionicons name="information-circle-outline" size={16} color={colors.info} />
      <Text style={[styles.previewText, { color: colors.textSecondary }]}>
        {t('payment.remainingBalance')}:{' '}
        <Text style={{ fontWeight: FONT_WEIGHTS.bold, color: remainingAfter === 0 ? colors.primary : colors.danger }}>
          {formatINR(remainingAfter)}
        </Text>
        {remainingAfter === 0 && ' 🎉'}
      </Text>
    </View>
  );
}
import { AppDataService } from '../../services/mockService';
import { rupeesToPaise } from '../../utils/currency';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import { formatINR, getInitials, formatDateTime } from '../../utils/formatters';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { SmsModal } from '../../components/common/SmsModal';
import { useAppTheme } from '../../context/ThemeContext';

type Props = NativeStackScreenProps<RootStackParamList, 'RecordPayment'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function RecordPaymentScreen({ route }: Props) {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { colors, isDark } = useAppTheme();
  const { customerId } = route.params;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState('cash');
  const [smsModalVisible, setSmsModalVisible] = useState(false);
  const [recordedPaymentAmount, setRecordedPaymentAmount] = useState(0);
  const [newBalance, setNewBalance] = useState(0);

  const PAYMENT_METHODS = [
    { id: 'cash', label: t('common.cash'), icon: 'cash-outline' },
    { id: 'upi', label: t('common.upi'), icon: 'phone-portrait-outline' },
    { id: 'neft', label: t('common.bank'), icon: 'business-outline' },
    { id: 'cheque', label: t('common.cheque'), icon: 'document-outline' },
  ];

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const c = await AppDataService.getCustomerById(customerId);
        if (isMounted) setCustomer(c);
      } catch (e) {
        Alert.alert(t('common.error'), 'Failed to load customer details');
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [customerId, t]);

  const schema = z.object({
    amount: z
      .string()
      .min(1, 'Amount is required')
      .regex(/^\d+(\.\d{1,2})?$/, 'Enter a valid amount (e.g. 500 or 500.50)')
      .refine((v) => parseFloat(v) > 0, 'Amount must be greater than ₹0')
      .refine(
        (v) => {
          const bal = customer?.balance ?? 0;
          if (bal <= 0) return true;
          return parseFloat(v) <= bal;
        },
        `Amount cannot exceed remaining balance (${formatINR(customer?.balance ?? 0)})`
      ),
    paymentMethod: z.string().default('cash'),
    notes: z.string().max(200, 'Notes too long').optional().default(''),
  });

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<RecordPaymentFormData>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
    defaultValues: {
      amount: '',
      paymentMethod: 'cash',
      notes: '',
    },
  });

  const onSubmit = async (data: RecordPaymentFormData) => {
    if (!customer || loading) return;
    if (customer.balance <= 0) {
      Alert.alert('No Balance Due', `${customer.name} has no outstanding balance.`);
      return;
    }

    const amountNum = parseFloat(data.amount || '0') || 0;
    setLoading(true);
    try {
      const amountPaise = rupeesToPaise(data.amount);

      const nowIso = new Date().toISOString();
      const recordedPayment = await AppDataService.recordPayment({
        customerId: customer.id,
        amountPaise,
        paymentMethod: selectedMethod,
        notes: data.notes?.trim() || `Payment via ${selectedMethod.toUpperCase()}`,
      });

      const updatedBalance = Math.max(0, (customer.balance || 0) - amountNum);
      setRecordedPaymentAmount(amountNum);
      setNewBalance(updatedBalance);

      const formattedDateTime = formatDateTime(
        recordedPayment?.paymentDate || recordedPayment?.createdAt || nowIso,
        i18n.language
      );

      const methodLabel =
        selectedMethod === 'neft'
          ? t('common.bank')
          : t(`common.${selectedMethod}`) || selectedMethod.toUpperCase();

      Alert.alert(
        t('payment.paymentRecordedTitle'),
        `${t('payment.paymentRecordedMsg', {
          amount: formatINR(amountNum),
          name: customer.name,
        })}\n\n📅 ${t('history.dateTimeLabel')}: ${formattedDateTime}\n💳 ${t('history.methodLabel')}: ${methodLabel}`,
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
      const message = err instanceof Error ? err.message : 'Failed to record payment';
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
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('payment.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          removeClippedSubviews={false}
        >
          {/* Customer info */}
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

          {/* If already cleared */}
          {customer.balance <= 0 ? (
            <View style={[styles.fullPaymentHint, { backgroundColor: isDark ? colors.surface : '#f0fdf4', borderColor: isDark ? colors.border : '#bbf7d0' }]}>
              <Ionicons name="checkmark-done-circle" size={18} color={colors.primary} />
              <Text style={[styles.fullPaymentText, { color: colors.primary }]}>
                {t('customers.fullyClearedAlertMsg', { name: customer.name })}
              </Text>
            </View>
          ) : (
            /* Full payment shortcut */
            <TouchableOpacity
              style={[styles.fullPaymentHint, { backgroundColor: isDark ? colors.surface : '#f0fdf4', borderColor: isDark ? colors.border : '#bbf7d0' }]}
              activeOpacity={0.7}
              onPress={() => setValue('amount', String(customer.balance), { shouldValidate: true })}
            >
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
              <Text style={[styles.fullPaymentText, { color: colors.primary }]}>
                {t('payment.fullDue')}: <Text style={styles.fullPaymentAmount}>{formatINR(customer.balance)}</Text>
              </Text>
            </TouchableOpacity>
          )}

          {/* Payment form */}
          <View style={[styles.formCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
            <Controller
              control={control}
              name="amount"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('payment.amountLabel')}
                  placeholder={t('payment.amountPlaceholder')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.amount?.message}
                  keyboardType="numeric"
                  prefix="₹"
                  hint={`${t('customers.outstandingDue')}: ${formatINR(customer.balance)}`}
                  editable={customer.balance > 0}
                  autoCorrect={false}
                  spellCheck={false}
                />
              )}
            />

            {/* Live balance preview (Isolated sub-component: does not re-render input on keystrokes) */}
            <PaymentRemainingPreview control={control} customerBalance={customer.balance} t={t} />

            {/* Payment method */}
            <Text style={[styles.methodLabel, { color: colors.textPrimary }]}>{t('payment.paymentMethodLabel')}</Text>
            <View style={styles.methodGrid}>
              {PAYMENT_METHODS.map((m) => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.methodChip, { backgroundColor: colors.surface, borderColor: colors.border }, selectedMethod === m.id && styles.methodChipActive]}
                  onPress={() => setSelectedMethod(m.id)}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name={m.icon as keyof typeof Ionicons.glyphMap}
                    size={18}
                    color={selectedMethod === m.id ? COLORS.white : colors.textSecondary}
                  />
                  <Text style={[styles.methodChipText, { color: colors.textSecondary }, selectedMethod === m.id && styles.methodChipTextActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  label={t('payment.notesLabel')}
                  placeholder={t('payment.notesPlaceholder')}
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

          {/* Submit */}
          <View style={styles.footer}>
            <Button
              title={loading ? t('payment.savingPaymentBtn') : t('payment.recordPaymentBtn')}
              onPress={handleSubmit(onSubmit)}
              variant={customer.balance <= 0 ? 'secondary' : 'primary'}
              size="lg"
              fullWidth
              loading={loading}
              disabled={customer.balance <= 0 || loading}
              icon={<Ionicons name="checkmark-circle-outline" size={20} color={customer.balance <= 0 ? COLORS.textSecondary : COLORS.white} />}
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
          transactionAmountRupees={recordedPaymentAmount}
          initialType="PAYMENT_RECEIVED"
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
    backgroundColor: COLORS.dangerLight,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[1],
    borderRadius: RADIUS.md,
  },
  balanceChipLabel: {
    fontSize: 10,
    color: COLORS.danger,
    fontWeight: FONT_WEIGHTS.medium,
  },
  balanceChipAmount: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.danger,
  },

  // Full payment hint
  fullPaymentHint: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.primaryLighter,
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
    marginBottom: SPACING[3],
    gap: SPACING[2],
    borderWidth: 1,
    borderColor: COLORS.primaryLight,
  },
  fullPaymentText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primaryDark,
  },
  fullPaymentAmount: {
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.primary,
  },

  // Form
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
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: RADIUS.md,
    padding: SPACING[3],
    marginBottom: SPACING[4],
    gap: SPACING[2],
  },
  previewText: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    flex: 1,
  },

  // Method selector
  methodLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textPrimary,
    marginBottom: SPACING[2],
  },
  methodGrid: {
    flexDirection: 'row',
    gap: SPACING[2],
    marginBottom: SPACING[4],
  },
  methodChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING[2],
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
    gap: 4,
  },
  methodChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  methodChipText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  methodChipTextActive: {
    color: COLORS.white,
    fontWeight: FONT_WEIGHTS.bold,
  },

  footer: {
    gap: SPACING[3],
    marginTop: SPACING[2],
    marginBottom: SPACING[8],
  },
});

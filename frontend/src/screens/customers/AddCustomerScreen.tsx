import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import DateTimePicker from '@react-native-community/datetimepicker';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList, AddCustomerFormData } from '../../types';
import { AppDataService } from '../../services/mockService';
import { rupeesToPaise } from '../../utils/currency';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { formatDate } from '../../utils/formatters';
import { useAppTheme } from '../../context/ThemeContext';

const COMMON_REASONS = ['Groceries', 'Medicine', 'Personal Loan', 'Hardware Supplies', 'Wholesale Goods'];

const schema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(60, 'Name too long'),
    phone: z
      .string()
      .min(10, 'Enter a valid 10-digit phone number')
      .max(13, 'Phone number too long')
      .regex(/^[6-9]\d{9}$/, 'Enter a valid Indian mobile number'),
    address: z.string().min(3, 'Address must be at least 3 characters').max(200, 'Address too long'),
    openingBalance: z
      .string()
      .regex(/^\d*(\.\d{1,2})?$/, 'Enter a valid number')
      .refine((v) => !v || parseFloat(v) >= 0, 'Opening balance cannot be negative')
      .refine((v) => !v || parseFloat(v) <= 5000000, 'Opening balance cannot exceed ₹50,00,000'),
    initialDueReason: z.string().max(100, 'Reason too long').optional(),
    initialDueDate: z.string().optional(),
    notes: z.string().max(200, 'Notes too long').optional(),
  })
  .superRefine((data, ctx) => {
    const obNum = parseFloat(data.openingBalance || '0');
    if (obNum > 0) {
      if (!data.initialDueReason || !data.initialDueReason.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['initialDueReason'],
          message: 'Reason for due is required when opening balance is greater than ₹0',
        });
      }
    }
  });

type Nav = NativeStackNavigationProp<RootStackParamList>;

interface DueFieldsBoxProps {
  control: any;
  errors: any;
  dueReasonInputRef: React.RefObject<any>;
  notesInputRef: React.RefObject<any>;
  selectedDate: Date;
  showDatePicker: boolean;
  setShowDatePicker: (show: boolean) => void;
  onDateChange: (event: any, date?: Date) => void;
  setValue: any;
  t: any;
}

function DueFieldsBox({
  control,
  errors,
  dueReasonInputRef,
  notesInputRef,
  selectedDate,
  showDatePicker,
  setShowDatePicker,
  onDateChange,
  setValue,
  t,
}: DueFieldsBoxProps) {
  const { colors } = useAppTheme();
  const openingBalanceValue = useWatch({ control, name: 'openingBalance' });
  const openingBalanceNum = parseFloat(openingBalanceValue || '0') || 0;
  const hasOpeningDue = openingBalanceNum > 0;

  return (
    <View style={[styles.dueFieldsBox, { backgroundColor: colors.surface, borderColor: colors.border }, hasOpeningDue && styles.dueFieldsBoxActive]}>
      <Controller
        control={control}
        name="initialDueReason"
        render={({ field: { onChange, onBlur, value } }) => (
          <Input
            ref={dueReasonInputRef}
            label={t('customers.dueReasonLabel')}
            placeholder={t('customers.dueReasonPlaceholder')}
            value={value ?? ''}
            onChangeText={onChange}
            onBlur={onBlur}
            error={errors.initialDueReason?.message}
            hint={hasOpeningDue ? t('validation.reasonRequired') : undefined}
            autoCorrect={false}
            spellCheck={false}
            returnKeyType="next"
            onSubmitEditing={() => notesInputRef.current?.focus()}
            blurOnSubmit={false}
          />
        )}
      />

      {/* Quick suggestion chips */}
      <View style={styles.chipRow}>
        {COMMON_REASONS.map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.chip, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
            onPress={() => setValue('initialDueReason', r, { shouldValidate: true })}
            activeOpacity={0.7}
          >
            <Text style={[styles.chipText, { color: colors.textSecondary }]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Due Date Picker Trigger */}
      <View style={styles.datePickerContainer}>
        <Text style={[styles.dateLabel, { color: colors.textSecondary }]}>{t('customers.dueDateLabel')}</Text>
        <TouchableOpacity
          style={[styles.dateSelector, { backgroundColor: colors.surfaceCard, borderColor: colors.border }]}
          onPress={() => setShowDatePicker(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={[styles.dateSelectorText, { color: colors.textPrimary }]}>
            {formatDate(selectedDate.toISOString())}
          </Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>
      </View>

      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
        />
      )}
    </View>
  );
}

export function AddCustomerScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const route = useRoute<RouteProp<RootStackParamList, 'AddCustomer'>>();
  const { colors, isDark } = useAppTheme();
  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Field input references for intentional keyboard Next navigation
  const nameInputRef = useRef<any>(null);
  const phoneInputRef = useRef<any>(null);
  const addressInputRef = useRef<any>(null);
  const openingBalanceInputRef = useRef<any>(null);
  const dueReasonInputRef = useRef<any>(null);
  const notesInputRef = useRef<any>(null);

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<Date>(today);

  const initialName = route.params?.initialName || '';
  const initialPhone = route.params?.initialPhone || '';

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AddCustomerFormData>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false, // Prevents sudden focus jumping to errors while typing
    defaultValues: {
      name: initialName,
      phone: initialPhone,
      address: '',
      openingBalance: '', // Empty initially per specification (no default 0)
      initialDueReason: '',
      initialDueDate: todayStr,
      notes: '',
    },
  });

  const onDateChange = (_event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
      const formatted = date.toISOString().split('T')[0];
      setValue('initialDueDate', formatted, { shouldValidate: true });
    }
  };

  const onSubmit = async (data: AddCustomerFormData) => {
    if (loading) return;
    setLoading(true);
    try {
      const trimmedPhone = data.phone.trim();
      if (trimmedPhone) {
        const existing = await AppDataService.getCustomerByPhone(trimmedPhone);
        if (existing) {
          Alert.alert(
            t('customers.duplicateCustomerTitle', 'Customer Already Exists'),
            t('customers.duplicateCustomerMsg', {
              defaultValue: `A customer named "${existing.name}" is already registered with this phone number (+91 ${trimmedPhone}).`,
              name: existing.name,
              phone: trimmedPhone,
            }),
            [
              {
                text: t('customers.viewCustomer', 'View Customer'),
                onPress: () => {
                  navigation.replace('CustomerDetails', { customerId: existing.id });
                },
              },
              {
                text: t('common.cancel', 'Cancel'),
                style: 'cancel',
              },
            ]
          );
          setLoading(false);
          return;
        }
      }

      const openingBalancePaise = rupeesToPaise(data.openingBalance || '0');
      const obNum = parseFloat(data.openingBalance || '0') || 0;
      const hasOpeningDue = obNum > 0;

      await AppDataService.addCustomer({
        name: data.name.trim(),
        phone: trimmedPhone,
        address: data.address.trim(),
        notes: data.notes?.trim() || '',
        openingBalancePaise,
        initialDueReason: hasOpeningDue ? data.initialDueReason?.trim() || 'Opening Due' : undefined,
        initialDueDate: hasOpeningDue ? selectedDate.toISOString() : undefined,
      });

      Alert.alert(
        t('customers.customerSavedTitle'),
        t('customers.customerSavedSuccess', { name: data.name }),
        [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save customer';
      Alert.alert(t('common.error'), message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        enabled={Platform.OS === 'ios'}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: colors.white, borderBottomColor: colors.border }]}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} activeOpacity={0.7}>
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('customers.addCustomerTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          removeClippedSubviews={false}
        >
          {/* Card */}
          <View style={[styles.formCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
            <Text style={[styles.cardSectionTitle, { color: colors.primary }]}>{t('customers.customerDetailsSection')}</Text>

            <Controller
              control={control}
              name="name"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  ref={nameInputRef}
                  label={t('customers.fullNameLabel')}
                  placeholder={t('customers.fullNamePlaceholder')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.name?.message}
                  autoCapitalize="words"
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="next"
                  onSubmitEditing={() => phoneInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              )}
            />

            <Controller
              control={control}
              name="phone"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  ref={phoneInputRef}
                  label={t('customers.phoneLabel')}
                  placeholder={t('customers.phonePlaceholder')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.phone?.message}
                  keyboardType="phone-pad"
                  maxLength={10}
                  prefix="+91"
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="next"
                  onSubmitEditing={() => addressInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              )}
            />

            <Controller
              control={control}
              name="address"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  ref={addressInputRef}
                  label={t('customers.addressLabel')}
                  placeholder={t('customers.addressPlaceholder')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.address?.message}
                  autoCapitalize="sentences"
                  autoCorrect={false}
                  spellCheck={false}
                  multiline
                  numberOfLines={2}
                  returnKeyType="next"
                  onSubmitEditing={() => openingBalanceInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              )}
            />

            <Text style={[styles.cardSectionTitle, { color: colors.primary, marginTop: SPACING[3] }]}>
              {t('customers.openingBalanceSection')}
            </Text>

            <Controller
              control={control}
              name="openingBalance"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  ref={openingBalanceInputRef}
                  label={t('customers.openingBalanceLabel')}
                  placeholder={t('customers.openingBalancePlaceholder')}
                  value={value ?? ''}
                  onChangeText={(text) => {
                    const sanitized = text.replace(/[^0-9.]/g, '');
                    const parts = sanitized.split('.');
                    const clean = parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : sanitized;
                    onChange(clean);
                  }}
                  onBlur={onBlur}
                  error={errors.openingBalance?.message}
                  keyboardType="decimal-pad"
                  prefix="₹"
                  hint={t('customers.openingBalanceHelper')}
                  autoCorrect={false}
                  spellCheck={false}
                  returnKeyType="next"
                  onSubmitEditing={() => dueReasonInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              )}
            />

            {/* Initial Due Reason & Due Date (Isolated sub-component: does not re-render parent inputs) */}
            <DueFieldsBox
              control={control}
              errors={errors}
              dueReasonInputRef={dueReasonInputRef}
              notesInputRef={notesInputRef}
              selectedDate={selectedDate}
              showDatePicker={showDatePicker}
              setShowDatePicker={setShowDatePicker}
              onDateChange={onDateChange}
              setValue={setValue}
              t={t}
            />

            <Controller
              control={control}
              name="notes"
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  ref={notesInputRef}
                  label={t('customers.notesLabel')}
                  placeholder={t('customers.notesPlaceholder')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  error={errors.notes?.message}
                  autoCorrect={false}
                  spellCheck={false}
                  multiline
                  numberOfLines={2}
                  returnKeyType="done"
                  blurOnSubmit={true}
                />
              )}
            />
          </View>

          {/* Action buttons */}
          <View style={styles.buttonContainer}>
            <Button
              title={loading ? t('customers.savingCustomerBtn') : t('customers.saveCustomerBtn')}
              onPress={handleSubmit(onSubmit)}
              variant="primary"
              size="lg"
              fullWidth
              loading={loading}
              icon={<Ionicons name="person-add" size={20} color="#ffffff" />}
              style={styles.saveBtn}
            />
            <Button
              title={t('common.cancel')}
              onPress={() => navigation.goBack()}
              variant="outline"
              size="md"
              fullWidth
              style={styles.cancelBtn}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    padding: SPACING[1],
  },
  headerTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  scrollContent: {
    padding: SPACING[4],
    paddingBottom: Platform.OS === 'android' ? 64 : 40,
  },
  formCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
    marginBottom: SPACING[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  cardSectionTitle: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
    marginBottom: SPACING[3],
  },
  dueFieldsBox: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
    marginBottom: SPACING[3],
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dueFieldsBoxActive: {
    borderColor: COLORS.primaryLight,
    backgroundColor: '#f0fdf4',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[2],
    marginBottom: SPACING[3],
  },
  chip: {
    backgroundColor: COLORS.white,
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
  datePickerContainer: {
    marginBottom: SPACING[2],
  },
  dateLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textPrimary,
    marginBottom: SPACING[1],
  },
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  dateSelectorText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textPrimary,
    marginLeft: SPACING[2],
  },
  dateHint: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  buttonContainer: {
    gap: SPACING[3],
    marginTop: SPACING[2],
    marginBottom: SPACING[8],
  },
  saveBtn: {
    backgroundColor: '#16a34a',
    minHeight: 52,
    borderRadius: RADIUS.xl,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  cancelBtn: {
    minHeight: 48,
    backgroundColor: '#ffffff',
    borderColor: '#e5e7eb',
    borderWidth: 1,
  },
});

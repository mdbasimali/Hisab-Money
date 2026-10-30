import React, { useEffect, useState, useRef } from 'react';
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
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList, EditCustomerFormData, Customer } from '../../types';
import { AppDataService } from '../../services/mockService';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { useAppTheme } from '../../context/ThemeContext';

const schema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(60, 'Name too long'),
  phone: z
    .string()
    .min(10, 'Enter a valid 10-digit phone number')
    .max(13, 'Phone number too long')
    .regex(/^[6-9]\d{9}$/, 'Enter a valid Indian mobile number'),
  address: z.string().min(3, 'Address must be at least 3 characters').max(200, 'Address too long'),
  notes: z.string().max(200, 'Notes too long').optional(),
});

type Props = NativeStackScreenProps<RootStackParamList, 'EditCustomer'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

export function EditCustomerScreen({ route }: Props) {
  const { t } = useTranslation();
  const navigation = useNavigation<Nav>();
  const { colors, isDark } = useAppTheme();
  const { customerId } = route.params;
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Field input references for intentional keyboard Next navigation
  const nameInputRef = useRef<any>(null);
  const phoneInputRef = useRef<any>(null);
  const addressInputRef = useRef<any>(null);
  const notesInputRef = useRef<any>(null);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EditCustomerFormData>({
    resolver: zodResolver(schema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    shouldFocusError: false,
    defaultValues: {
      name: '',
      phone: '',
      address: '',
      notes: '',
    },
  });

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const c = await AppDataService.getCustomerById(customerId);
        if (c && isMounted) {
          setCustomer(c);
          reset({
            name: c.name,
            phone: c.phone,
            address: c.address,
            notes: c.notes || '',
          });
        }
      } catch (err) {
        Alert.alert(t('common.error'), 'Failed to load customer profile');
      } finally {
        if (isMounted) setInitialLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [customerId, reset, t]);

  const onSubmit = async (data: EditCustomerFormData) => {
    setSaving(true);
    try {
      await AppDataService.updateCustomer({
        id: customerId,
        name: data.name.trim(),
        phone: data.phone.trim(),
        address: data.address.trim(),
        notes: data.notes?.trim() || '',
      });

      Alert.alert(
        t('customers.changesSavedTitle'),
        t('customers.changesSavedSuccess'),
        [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update customer';
      Alert.alert(t('common.error'), message);
    } finally {
      setSaving(false);
    }
  };

  if (initialLoading) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>{t('common.loading')}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const savedOpeningBalance = customer
    ? customer.openingBalance != null
      ? String(customer.openingBalance)
      : customer.openingBalancePaise != null
      ? String(customer.openingBalancePaise / 100)
      : '0'
    : '0';

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
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('customers.editCustomerTitle')}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="none"
          removeClippedSubviews={false}
        >
          <View style={[styles.formCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
            <Text style={[styles.cardSectionTitle, { color: colors.primary }]}>{t('customers.editSectionTitle')}</Text>

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
                  onSubmitEditing={() => notesInputRef.current?.focus()}
                  blurOnSubmit={false}
                />
              )}
            />

            {/* Display Saved Opening Balance (Read-Only) */}
            <Input
              label={t('customers.openingBalanceLabel')}
              value={savedOpeningBalance}
              prefix="₹"
              editable={false}
              hint={t('customers.openingBalanceSavedHint')}
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
              title={saving ? t('customers.savingChangesBtn') : t('customers.saveChangesBtn')}
              onPress={handleSubmit(onSubmit)}
              variant="primary"
              size="lg"
              fullWidth
              loading={saving}
              icon={<Ionicons name="checkmark-circle-outline" size={20} color={COLORS.white} />}
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
  buttonContainer: {
    gap: SPACING[2],
    marginBottom: SPACING[6],
  },
});

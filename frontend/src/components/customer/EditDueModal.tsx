import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Transaction } from '../../types';
import { useAppTheme } from '../../context/ThemeContext';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { formatINR } from '../../utils/formatters';
import { AppDataService } from '../../services/mockService';

interface EditDueModalProps {
  visible: boolean;
  transaction: Transaction | null;
  onClose: () => void;
  onUpdated: () => void;
}

export function EditDueModal({
  visible,
  transaction,
  onClose,
  onUpdated,
}: EditDueModalProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();

  const [amountInput, setAmountInput] = useState('');
  const [reasonInput, setReasonInput] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSub = Keyboard.addListener(showEvent, () => setIsKeyboardVisible(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setIsKeyboardVisible(false));

    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    if (visible && transaction) {
      setAmountInput(transaction.amount ? transaction.amount.toString() : '');
      setReasonInput(transaction.reason || '');
      setAmountError(null);
      setIsConfirming(false);
      setIsSaving(false);
    }
  }, [visible, transaction]);

  if (!transaction) return null;

  const handleValidateAndProceed = () => {
    Keyboard.dismiss();
    const cleanAmountStr = amountInput.trim();
    if (!cleanAmountStr) {
      setAmountError(t('editDue.amountRequired', 'Due amount must be greater than ₹0'));
      return;
    }

    const parsed = parseFloat(cleanAmountStr);
    if (isNaN(parsed) || parsed <= 0) {
      setAmountError(t('editDue.invalidAmount', 'Please enter a valid amount greater than ₹0'));
      return;
    }

    setAmountError(null);
    setIsConfirming(true);
  };

  const handleConfirmSave = async () => {
    const parsed = parseFloat(amountInput.trim());
    const amountPaise = Math.round(parsed * 100);

    // If reason is left blank, preserve existing reason
    const finalReason = reasonInput.trim() ? reasonInput.trim() : transaction.reason;

    try {
      setIsSaving(true);
      await AppDataService.updateDue({
        id: transaction.id,
        amountPaise,
        reason: finalReason,
        notes: reasonInput.trim() || undefined,
      });

      setIsSaving(false);
      setIsConfirming(false);
      onUpdated();
      Alert.alert(
        t('common.done', 'Success'),
        t('editDue.successMessage', 'Due transaction updated successfully.')
      );
    } catch (err: any) {
      setIsSaving(false);
      console.warn('[EditDueModal] Failed to update due transaction:', err);
      Alert.alert(
        t('common.error', 'Error'),
        err?.message || 'Failed to update transaction. Please try again.'
      );
    }
  };

  const handleClose = () => {
    if (isKeyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    setIsConfirming(false);
    onClose();
  };

  const currentParsedAmount = parseFloat(amountInput.trim()) || 0;
  const isReasonModified = reasonInput.trim() !== '' && reasonInput.trim() !== (transaction.reason || '').trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        <View style={styles.modalOverlay}>
          {/* Backdrop dismissal */}
          <TouchableWithoutFeedback
            onPress={() => {
              if (isKeyboardVisible) {
                Keyboard.dismiss();
              } else if (!isConfirming) {
                onClose();
              }
            }}
            accessible={false}
          >
            <View style={StyleSheet.absoluteFill} />
          </TouchableWithoutFeedback>

          {/* Main Card */}
          <View
            style={[
              styles.modalCard,
              { backgroundColor: colors.surfaceCard, borderColor: colors.border },
            ]}
          >
            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.scrollContent}
            >
              <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                <View>
                  {!isConfirming ? (
                    // ── Edit Due Form ───────────────────────────────────────────────
                    <>
                      {/* Header */}
                      <View style={[styles.headerRow, { borderBottomColor: colors.borderLight }]}>
                        <View
                          style={[
                            styles.headerIconWrap,
                            { backgroundColor: isDark ? colors.primaryLight : '#dcfce7' },
                          ]}
                        >
                          <Ionicons name="create-outline" size={20} color={colors.primary} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                            {t('editDue.title', 'Edit Due Transaction')}
                          </Text>
                          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                            {t('editDue.subtitle', 'Update transaction amount or reason')}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={onClose}
                          hitSlop={8}
                          activeOpacity={0.7}
                          style={styles.closeBtn}
                          accessibilityRole="button"
                          accessibilityLabel="Close"
                        >
                          <Ionicons name="close-circle" size={24} color={colors.textMuted} />
                        </TouchableOpacity>
                      </View>

                      {/* Body */}
                      <View style={styles.body}>
                        {/* Amount Field */}
                        <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                          {t('editDue.amountLabel', 'Due Amount (₹) *')}
                        </Text>
                        <View
                          style={[
                            styles.inputWrap,
                            {
                              backgroundColor: isDark ? colors.surface : '#f8fafc',
                              borderColor: amountError ? colors.danger : colors.border,
                            },
                          ]}
                        >
                          <Text style={[styles.currencyPrefix, { color: colors.textSecondary }]}>₹</Text>
                          <TextInput
                            value={amountInput}
                            onChangeText={(val) => {
                              setAmountInput(val);
                              if (amountError) setAmountError(null);
                            }}
                            placeholder={t('editDue.amountPlaceholder', '0.00')}
                            placeholderTextColor={colors.textMuted}
                            keyboardType="decimal-pad"
                            style={[styles.textInput, { color: colors.textPrimary }]}
                            autoFocus
                          />
                          {amountInput.length > 0 && (
                            <TouchableOpacity
                              onPress={() => setAmountInput('')}
                              hitSlop={6}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                            </TouchableOpacity>
                          )}
                        </View>
                        {amountError ? (
                          <Text style={[styles.errorText, { color: colors.danger }]}>{amountError}</Text>
                        ) : null}

                        {/* Reason / Notes Field */}
                        <Text style={[styles.inputLabel, { color: colors.textSecondary, marginTop: SPACING[3] }]}>
                          {t('editDue.reasonLabel', 'Reason / Notes (Optional)')}
                        </Text>
                        <View
                          style={[
                            styles.inputWrap,
                            {
                              backgroundColor: isDark ? colors.surface : '#f8fafc',
                              borderColor: colors.border,
                            },
                          ]}
                        >
                          <TextInput
                            value={reasonInput}
                            onChangeText={setReasonInput}
                            placeholder={t('editDue.reasonPlaceholder', 'e.g. Groceries, Supplies (Optional)')}
                            placeholderTextColor={colors.textMuted}
                            maxLength={100}
                            style={[styles.textInput, { color: colors.textPrimary }]}
                          />
                          {reasonInput.length > 0 && (
                            <TouchableOpacity
                              onPress={() => setReasonInput('')}
                              hitSlop={6}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                            </TouchableOpacity>
                          )}
                        </View>
                        <Text style={[styles.helperText, { color: colors.textMuted }]}>
                          {t('editDue.reasonHint', 'Reason is optional. Leave unchanged or update.')}
                        </Text>
                      </View>

                      {/* Footer Actions */}
                      <View style={[styles.footerRow, { borderTopColor: colors.borderLight }]}>
                        <TouchableOpacity
                          style={[styles.btn, styles.cancelBtn, { borderColor: colors.border }]}
                          onPress={onClose}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                            {t('common.cancel', 'Cancel')}
                          </Text>
                        </TouchableOpacity>
                        <View style={{ width: 12 }} />
                        <TouchableOpacity
                          style={[styles.btn, styles.saveBtn, { backgroundColor: colors.primary }]}
                          onPress={handleValidateAndProceed}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.saveBtnText}>
                            {t('editDue.saveChanges', 'Save Changes')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    // ── Confirmation Dialog ─────────────────────────────────────────
                    <>
                      {/* Confirmation Header */}
                      <View style={[styles.headerRow, { borderBottomColor: colors.borderLight }]}>
                        <View style={[styles.headerIconWrap, { backgroundColor: '#fef3c7' }]}>
                          <Ionicons name="help-circle-outline" size={22} color="#d97706" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.title, { color: colors.textPrimary }]}>
                            {t('editDue.confirmTitle', 'Confirm Transaction Update')}
                          </Text>
                          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                            {t('editDue.confirmMessage', 'Are you sure you want to update this due transaction?')}
                          </Text>
                        </View>
                      </View>

                      {/* Comparison Details Card */}
                      <View style={[styles.comparisonCard, { backgroundColor: isDark ? colors.surface : '#f8fafc', borderColor: colors.borderLight }]}>
                        {/* Amount Row */}
                        <View style={styles.comparisonRow}>
                          <View style={styles.comparisonCol}>
                            <Text style={[styles.comparisonLabel, { color: colors.textMuted }]}>
                              {t('editDue.previousAmount', 'Previous Amount')}
                            </Text>
                            <Text style={[styles.prevAmountText, { color: colors.textSecondary }]}>
                              {formatINR(transaction.amount)}
                            </Text>
                          </View>
                          <Ionicons name="arrow-forward" size={18} color={colors.primary} style={{ marginTop: 12 }} />
                          <View style={styles.comparisonCol}>
                            <Text style={[styles.comparisonLabel, { color: colors.textMuted }]}>
                              {t('editDue.newAmount', 'New Amount')}
                            </Text>
                            <Text style={[styles.newAmountText, { color: colors.primary }]}>
                              {formatINR(currentParsedAmount)}
                            </Text>
                          </View>
                        </View>

                        <View style={[styles.divider, { backgroundColor: colors.borderLight }]} />

                        {/* Reason Row */}
                        <View style={styles.comparisonMetaRow}>
                          <Text style={[styles.comparisonLabel, { color: colors.textMuted }]}>
                            {t('editDue.previousReason', 'Previous Reason')}:
                          </Text>
                          <Text style={[styles.metaVal, { color: colors.textPrimary }]} numberOfLines={1}>
                            {transaction.reason || 'None'}
                          </Text>
                        </View>

                        <View style={styles.comparisonMetaRow}>
                          <Text style={[styles.comparisonLabel, { color: colors.textMuted }]}>
                            {t('editDue.updatedReason', 'Updated Reason')}:
                          </Text>
                          <Text style={[styles.metaVal, { color: isReasonModified ? colors.primary : colors.textPrimary }]} numberOfLines={1}>
                            {reasonInput.trim() ? reasonInput.trim() : `${transaction.reason} (${t('editDue.unchanged', 'Unchanged')})`}
                          </Text>
                        </View>
                      </View>

                      {/* Confirmation Footer Actions */}
                      <View style={[styles.footerRow, { borderTopColor: colors.borderLight }]}>
                        <TouchableOpacity
                          style={[styles.btn, styles.cancelBtn, { borderColor: colors.border }]}
                          onPress={() => setIsConfirming(false)}
                          disabled={isSaving}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                            {t('common.cancel', 'Cancel')}
                          </Text>
                        </TouchableOpacity>
                        <View style={{ width: 12 }} />
                        <TouchableOpacity
                          style={[styles.btn, styles.saveBtn, { backgroundColor: colors.primary }]}
                          onPress={handleConfirmSave}
                          disabled={isSaving}
                          activeOpacity={0.8}
                        >
                          {isSaving ? (
                            <ActivityIndicator size="small" color="#ffffff" />
                          ) : (
                            <Text style={styles.saveBtnText}>
                              {t('editDue.confirmUpdateBtn', 'Confirm Update')}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>
              </TouchableWithoutFeedback>
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[4],
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    borderRadius: RADIUS['2xl'],
    borderWidth: 1,
    padding: SPACING[4],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    alignSelf: 'center',
    overflow: 'hidden',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: SPACING[3],
    borderBottomWidth: 1,
    marginBottom: SPACING[3],
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  closeBtn: {
    padding: 2,
    marginLeft: SPACING[2],
  },
  body: {
    paddingVertical: SPACING[2],
  },
  inputLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING[3],
    height: 48,
  },
  currencyPrefix: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
    paddingVertical: 0,
    height: '100%',
  },
  errorText: {
    fontSize: FONT_SIZES.xs,
    marginTop: 4,
    fontWeight: FONT_WEIGHTS.medium,
  },
  helperText: {
    fontSize: FONT_SIZES.xs,
    marginTop: 6,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING[4],
    borderTopWidth: 1,
    marginTop: SPACING[3],
  },
  btn: {
    flex: 1,
    height: 48,
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  saveBtn: {},
  saveBtnText: {
    color: '#ffffff',
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  comparisonCard: {
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
    marginVertical: SPACING[2],
  },
  comparisonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: SPACING[2],
  },
  comparisonCol: {
    alignItems: 'center',
  },
  comparisonLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 4,
  },
  prevAmountText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    textDecorationLine: 'line-through',
  },
  newAmountText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
  },
  divider: {
    height: 1,
    marginVertical: SPACING[2],
  },
  comparisonMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  metaVal: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    maxWidth: '60%',
  },
});


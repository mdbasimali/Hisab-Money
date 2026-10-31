import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Customer, Transaction } from '../../types';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';
import {
  CustomerPdfReportService,
  CustomerPdfDateFilter,
} from '../../services/customerPdfReportService';
import { formatINR, formatDate } from '../../utils/formatters';

interface CustomerPdfModalProps {
  visible: boolean;
  onClose: () => void;
  customer: Customer;
  transactions: Transaction[];
  businessName?: string;
}

export function CustomerPdfModal({
  visible,
  onClose,
  customer,
  transactions,
  businessName,
}: CustomerPdfModalProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();

  const [filter, setFilter] = useState<CustomerPdfDateFilter>('all');
  const now = new Date();
  const [startDate, setStartDate] = useState<Date>(
    new Date(now.getFullYear(), now.getMonth(), 1)
  );
  const [endDate, setEndDate] = useState<Date>(now);

  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Compute live preview numbers for the selected filter
  const preview = CustomerPdfReportService.processLedgerData(customer, transactions, {
    filter,
    customStartDate: startDate,
    customEndDate: endDate,
  });

  const handleGenerateAndShare = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const result = await CustomerPdfReportService.generateCustomerPdf(customer, transactions, {
        filter,
        customStartDate: startDate,
        customEndDate: endDate,
        businessName,
      });

      await CustomerPdfReportService.shareCustomerPdf(result.uri, customer.name);
      onClose();
    } catch (e: any) {
      console.warn('[CustomerPdfModal] PDF error:', e);
      Alert.alert(t('common.error'), e?.message || 'Failed to generate PDF report.');
    } finally {
      setGenerating(false);
    }
  };

  const handlePrint = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const result = await CustomerPdfReportService.generateCustomerPdf(customer, transactions, {
        filter,
        customStartDate: startDate,
        customEndDate: endDate,
        businessName,
      });

      await CustomerPdfReportService.printCustomerPdf(result.uri);
      onClose();
    } catch (e: any) {
      console.warn('[CustomerPdfModal] Print error:', e);
      Alert.alert(t('common.error'), e?.message || 'Failed to print PDF report.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            { backgroundColor: colors.surfaceCard, borderColor: colors.border },
          ]}
        >
          {/* Header */}
          <View style={[styles.header, { borderBottomColor: colors.borderLight }]}>
            <View style={[styles.headerIcon, { backgroundColor: isDark ? '#064e3b' : '#dcfce7' }]}>
              <Ionicons name="document-text" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={1}>
                {t('customers.pdfReportTitle', 'Customer Ledger PDF')}
              </Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                {customer.name} {customer.phone ? `(+91 ${customer.phone})` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={8} activeOpacity={0.7}>
              <Ionicons name="close-circle" size={24} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
            {/* Filter Section */}
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              {t('customers.pdfSelectPeriod', 'SELECT REPORTING PERIOD')}
            </Text>

            <View style={styles.filterRow}>
              <TouchableOpacity
                style={[
                  styles.filterChip,
                  { borderColor: filter === 'all' ? colors.primary : colors.border },
                  filter === 'all' && {
                    backgroundColor: isDark ? '#064e3b' : '#dcfce7',
                  },
                ]}
                onPress={() => setFilter('all')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: filter === 'all' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {t('customers.pdfAllTime', 'All Time')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterChip,
                  { borderColor: filter === 'this_month' ? colors.primary : colors.border },
                  filter === 'this_month' && {
                    backgroundColor: isDark ? '#064e3b' : '#dcfce7',
                  },
                ]}
                onPress={() => setFilter('this_month')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: filter === 'this_month' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {t('customers.pdfThisMonth', 'This Month')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.filterChip,
                  { borderColor: filter === 'custom' ? colors.primary : colors.border },
                  filter === 'custom' && {
                    backgroundColor: isDark ? '#064e3b' : '#dcfce7',
                  },
                ]}
                onPress={() => setFilter('custom')}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: filter === 'custom' ? colors.primary : colors.textSecondary },
                  ]}
                >
                  {t('customers.pdfCustomRange', 'Custom Range')}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Custom Date Pickers */}
            {filter === 'custom' && (
              <View
                style={[
                  styles.customDateBox,
                  { backgroundColor: isDark ? colors.surface : '#f8fafc', borderColor: colors.border },
                ]}
              >
                <View style={styles.datePickerCol}>
                  <Text style={[styles.datePickerLabel, { color: colors.textSecondary }]}>
                    {t('customers.pdfStartDate', 'Start Date')}
                  </Text>
                  <TouchableOpacity
                    style={[styles.datePickerBtn, { borderColor: colors.border, backgroundColor: colors.surfaceCard }]}
                    onPress={() => setShowStartPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                    <Text style={[styles.datePickerText, { color: colors.textPrimary }]}>
                      {formatDate(startDate.toISOString())}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.datePickerCol}>
                  <Text style={[styles.datePickerLabel, { color: colors.textSecondary }]}>
                    {t('customers.pdfEndDate', 'End Date')}
                  </Text>
                  <TouchableOpacity
                    style={[styles.datePickerBtn, { borderColor: colors.border, backgroundColor: colors.surfaceCard }]}
                    onPress={() => setShowEndPicker(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons name="calendar-outline" size={16} color={colors.primary} />
                    <Text style={[styles.datePickerText, { color: colors.textPrimary }]}>
                      {formatDate(endDate.toISOString())}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {showStartPicker && (
              <DateTimePicker
                value={startDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_e, date) => {
                  setShowStartPicker(false);
                  if (date) setStartDate(date);
                }}
              />
            )}

            {showEndPicker && (
              <DateTimePicker
                value={endDate}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_e, date) => {
                  setShowEndPicker(false);
                  if (date) setEndDate(date);
                }}
              />
            )}

            {/* Statement Preview Summary Card */}
            <View
              style={[
                styles.previewCard,
                { backgroundColor: isDark ? colors.surface : '#f1f5f9', borderColor: colors.border },
              ]}
            >
              <View style={styles.previewHeader}>
                <Text style={[styles.previewPeriodLabel, { color: colors.primary }]}>
                  {preview.periodLabel}
                </Text>
                <Text
                  style={[
                    styles.previewStatusBadge,
                    {
                      color: preview.isCleared ? colors.primary : colors.danger,
                      backgroundColor: preview.isCleared
                        ? isDark ? '#064e3b' : '#dcfce7'
                        : isDark ? '#450a0a' : '#fee2e2',
                    },
                  ]}
                >
                  {preview.isCleared ? 'All Cleared ✓' : 'Due Pending'}
                </Text>
              </View>

              <View style={styles.previewStatsGrid}>
                <View style={styles.previewStatItem}>
                  <Text style={[styles.previewStatLabel, { color: colors.textMuted }]}>Opening</Text>
                  <Text style={[styles.previewStatVal, { color: colors.textPrimary }]}>
                    {formatINR(preview.periodOpeningPaise / 100)}
                  </Text>
                </View>
                <View style={styles.previewStatItem}>
                  <Text style={[styles.previewStatLabel, { color: colors.textMuted }]}>New Dues</Text>
                  <Text style={[styles.previewStatVal, { color: '#ea580c' }]}>
                    +{formatINR(preview.periodDuesPaise / 100)}
                  </Text>
                </View>
                <View style={styles.previewStatItem}>
                  <Text style={[styles.previewStatLabel, { color: colors.textMuted }]}>Paid</Text>
                  <Text style={[styles.previewStatVal, { color: colors.primary }]}>
                    -{formatINR(preview.periodPaidPaise / 100)}
                  </Text>
                </View>
                <View style={styles.previewStatItem}>
                  <Text style={[styles.previewStatLabel, { color: colors.textMuted }]}>Closing</Text>
                  <Text
                    style={[
                      styles.previewStatVal,
                      { color: preview.isCleared ? colors.primary : colors.danger, fontWeight: '700' },
                    ]}
                  >
                    {formatINR(preview.closingBalancePaise / 100)}
                  </Text>
                </View>
              </View>

              <Text style={[styles.entryCountText, { color: colors.textSecondary }]}>
                {preview.rows.length} {preview.rows.length === 1 ? 'transaction' : 'transactions'} included in this statement
              </Text>
            </View>
          </ScrollView>

          {/* Action Buttons */}
          <View style={[styles.actionsContainer, { borderTopColor: colors.borderLight }]}>
            <TouchableOpacity
              style={[styles.primaryActionBtn, { backgroundColor: colors.primary }]}
              onPress={handleGenerateAndShare}
              disabled={generating}
              activeOpacity={0.8}
            >
              {generating ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="share-social-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                  <Text style={styles.primaryActionBtnText}>
                    {t('customers.pdfDownloadAndShare', 'Download & Share PDF')}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={[styles.secondaryActionBtn, { borderColor: colors.border }]}
                onPress={handlePrint}
                disabled={generating}
                activeOpacity={0.7}
              >
                <Ionicons name="print-outline" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                <Text style={[styles.secondaryActionBtnText, { color: colors.textPrimary }]}>
                  {t('customers.pdfPrintPreview', 'Print / Preview')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.border }]}
                onPress={onClose}
                disabled={generating}
                activeOpacity={0.7}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                  {t('common.cancel', 'Cancel')}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING[4],
  },
  container: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '90%',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.15,
        shadowRadius: 14,
      },
      android: {
        elevation: 10,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    borderBottomWidth: 1,
    gap: SPACING[3],
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  subtitle: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  body: {
    padding: SPACING[4],
  },
  sectionTitle: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    letterSpacing: 0.5,
    marginBottom: SPACING[2],
  },
  filterRow: {
    flexDirection: 'row',
    gap: SPACING[2],
    marginBottom: SPACING[3],
  },
  filterChip: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    textAlign: 'center',
  },
  customDateBox: {
    flexDirection: 'row',
    gap: SPACING[3],
    padding: SPACING[3],
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginBottom: SPACING[3],
  },
  datePickerCol: {
    flex: 1,
  },
  datePickerLabel: {
    fontSize: FONT_SIZES.xs,
    marginBottom: 4,
    fontWeight: FONT_WEIGHTS.medium,
  },
  datePickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: SPACING[3],
    paddingVertical: 8,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  datePickerText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  previewCard: {
    padding: SPACING[3],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING[2],
  },
  previewPeriodLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  previewStatusBadge: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  previewStatsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: SPACING[2],
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
  },
  previewStatItem: {
    alignItems: 'center',
  },
  previewStatLabel: {
    fontSize: 9,
    fontWeight: FONT_WEIGHTS.medium,
    textTransform: 'uppercase',
  },
  previewStatVal: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: 2,
  },
  entryCountText: {
    fontSize: FONT_SIZES.xs,
    textAlign: 'center',
    marginTop: SPACING[2],
  },
  actionsContainer: {
    padding: SPACING[4],
    borderTopWidth: 1,
    gap: SPACING[2],
  },
  primaryActionBtn: {
    flexDirection: 'row',
    height: 46,
    borderRadius: RADIUS.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryActionBtnText: {
    color: '#ffffff',
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  secondaryActions: {
    flexDirection: 'row',
    gap: SPACING[2],
  },
  secondaryActionBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 40,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryActionBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  cancelBtn: {
    flex: 1,
    height: 40,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});


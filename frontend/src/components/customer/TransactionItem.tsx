import React, { memo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import type { Transaction } from '../../types';
import {
  COLORS,
  FONT_SIZES,
  FONT_WEIGHTS,
  RADIUS,
  SPACING,
} from '../../constants/theme';
import { formatINR, formatDateTime } from '../../utils/formatters';
import { useAppTheme } from '../../context/ThemeContext';

interface TransactionItemProps {
  transaction: Transaction;
  showCustomerName?: boolean;
}

export const TransactionItem = memo(function TransactionItem({
  transaction,
  showCustomerName = false,
}: TransactionItemProps) {
  const { t, i18n } = useTranslation();
  const { isDark, colors } = useAppTheme();
  const [detailsVisible, setDetailsVisible] = useState(false);

  const isPayment = transaction.type === 'payment';
  const isOpening = transaction.subType === 'opening';
  const isNewDue = transaction.subType === 'new_due';

  // Label configuration
  let label = 'Credit Given';
  let badgeColor: string = colors.danger;
  let iconName: keyof typeof Ionicons.glyphMap = 'arrow-up-circle';
  let iconBg: string = isDark ? colors.dangerLight : COLORS.dangerLight;

  if (isPayment) {
    label = 'Payment Received';
    badgeColor = colors.primary;
    iconName = 'arrow-down-circle';
    iconBg = isDark ? colors.primaryLight : COLORS.primaryLighter;
  } else if (isOpening) {
    label = 'Opening Balance';
    badgeColor = colors.gold;
    iconName = 'wallet-outline';
    iconBg = isDark ? colors.warningLight : COLORS.warningLight;
  } else if (isNewDue) {
    label = transaction.reason ? `Due: ${transaction.reason}` : 'New Due Added';
    badgeColor = colors.danger;
    iconName = 'cart-outline';
    iconBg = isDark ? colors.dangerLight : COLORS.dangerLight;
  }

  const formattedDateTime = formatDateTime(transaction.createdAt, i18n.language);

  return (
    <>
      <TouchableOpacity
        style={[styles.item, { borderBottomColor: colors.borderLight }]}
        onPress={() => setDetailsVisible(true)}
        activeOpacity={0.65}
        delayPressIn={0}
      >
        {/* Icon */}
        <View style={[styles.iconContainer, { backgroundColor: iconBg }]}>
          <Ionicons name={iconName} size={22} color={badgeColor} />
        </View>

        {/* Details */}
        <View style={styles.details}>
          {showCustomerName && (
            <Text style={[styles.customerName, { color: colors.primary }]}>{transaction.customerName}</Text>
          )}
          <View style={styles.labelRow}>
            <Text style={[styles.typeLabel, { color: colors.textPrimary }]} numberOfLines={1}>
              {label}
            </Text>
          </View>
          {transaction.notes && transaction.notes !== label ? (
            <Text style={[styles.notes, { color: colors.textSecondary }]} numberOfLines={1}>
              {transaction.notes}
            </Text>
          ) : null}
          <Text style={[styles.time, { color: colors.textMuted }]}>{formattedDateTime}</Text>
        </View>

        {/* Amount */}
        <View style={styles.amountContainer}>
          <Text
            style={[
              styles.amount,
              { color: isPayment ? colors.primary : colors.danger },
            ]}
          >
            {isPayment ? '-' : '+'}{formatINR(transaction.amount)}
          </Text>
          <Text style={[styles.typeBadge, { color: badgeColor }]}>
            {isPayment ? 'Paid' : 'Due'}
          </Text>
        </View>
      </TouchableOpacity>

      {/* Transaction Details / Payment Receipt Modal */}
      <Modal
        visible={detailsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDetailsVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="receipt-outline" size={20} color={colors.primary} />
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>{t('history.txDetailsTitle')}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setDetailsVisible(false)}
                style={styles.closeBtn}
                hitSlop={8}
              >
                <Ionicons name="close" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Hero Amount */}
              <View
                style={[
                  styles.heroAmountBox,
                  { backgroundColor: isPayment ? (isDark ? colors.primaryLight : '#f0fdf4') : (isDark ? colors.dangerLight : '#fef2f2') },
                ]}
              >
                <Text
                  style={[
                    styles.heroAmount,
                    { color: isPayment ? colors.primary : colors.danger },
                  ]}
                >
                  {isPayment ? '-' : '+'}{formatINR(transaction.amount)}
                </Text>
                <Text style={[styles.heroType, { color: badgeColor }]}>
                  {label}
                </Text>
              </View>

              {/* Detail Rows */}
              <View style={[styles.infoList, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[styles.infoRow, { borderBottomColor: colors.borderLight }]}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('customers.fullNameLabel').replace('*', '').trim()}</Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{transaction.customerName}</Text>
                </View>

                <View style={[styles.infoRow, { borderBottomColor: colors.borderLight }]}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('history.dateTimeLabel')}</Text>
                  <Text style={[styles.infoValueHighlight, { color: colors.primary }]}>{formattedDateTime}</Text>
                </View>

                {transaction.paymentMethod ? (
                  <View style={[styles.infoRow, { borderBottomColor: colors.borderLight }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('history.methodLabel')}</Text>
                    <Text style={[styles.infoValue, { color: colors.textPrimary }]}>
                      {transaction.paymentMethod.toUpperCase()}
                    </Text>
                  </View>
                ) : null}

                {transaction.notes ? (
                  <View style={[styles.infoRow, { borderBottomColor: colors.borderLight }]}>
                    <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('customers.notesLabel')}</Text>
                    <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{transaction.notes}</Text>
                  </View>
                ) : null}

                <View style={[styles.infoRow, { borderBottomColor: colors.borderLight }]}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('history.statusLabel')}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: isDark ? colors.primaryLight : '#ecfdf5' }]}>
                    <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
                    <Text style={[styles.statusText, { color: colors.primary }]}>{t('history.confirmedStatus')}</Text>
                  </View>
                </View>

                <View style={[styles.infoRow, { borderBottomWidth: 0 }]}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{t('history.refIdLabel')}</Text>
                  <Text style={[styles.infoRefValue, { color: colors.textMuted }]} numberOfLines={1}>
                    {transaction.id}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: colors.primary }]}
                onPress={() => setDetailsVisible(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.doneBtnText}>{t('common.done')}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
});

const styles = StyleSheet.create({
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING[3],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  details: {
    flex: 1,
  },
  customerName: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.primaryDark,
    marginBottom: 1,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  typeLabel: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  notes: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  time: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: 2,
    fontWeight: FONT_WEIGHTS.medium,
  },
  amountContainer: {
    alignItems: 'flex-end',
    marginLeft: SPACING[2],
  },
  amount: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
  },
  typeBadge: {
    fontSize: 10,
    fontWeight: FONT_WEIGHTS.bold,
    marginTop: 2,
    textTransform: 'uppercase',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING[4],
  },
  modalCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
    width: '100%',
    maxWidth: 400,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: SPACING[3],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  closeBtn: {
    padding: SPACING[1],
  },
  heroAmountBox: {
    alignItems: 'center',
    paddingVertical: SPACING[4],
    borderRadius: RADIUS.lg,
    marginVertical: SPACING[3],
  },
  heroAmount: {
    fontSize: 32,
    fontWeight: FONT_WEIGHTS.bold,
  },
  heroType: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    marginTop: 4,
  },
  infoList: {
    backgroundColor: '#f9fafb',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING[2],
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  infoLabel: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  infoValue: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textPrimary,
    fontWeight: FONT_WEIGHTS.semibold,
    maxWidth: '60%',
    textAlign: 'right',
  },
  infoValueHighlight: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primaryDark,
    fontWeight: FONT_WEIGHTS.bold,
    maxWidth: '65%',
    textAlign: 'right',
  },
  infoRefValue: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontFamily: 'monospace',
    maxWidth: '60%',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ecfdf5',
    paddingHorizontal: SPACING[2],
    paddingVertical: 2,
    borderRadius: RADIUS.sm,
  },
  statusText: {
    fontSize: FONT_SIZES.xs,
    color: '#16a34a',
    fontWeight: FONT_WEIGHTS.semibold,
  },
  doneBtn: {
    backgroundColor: '#16a34a',
    borderRadius: RADIUS.lg,
    paddingVertical: SPACING[3],
    alignItems: 'center',
    marginTop: SPACING[4],
  },
  doneBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

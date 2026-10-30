import React, { memo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Customer } from '../../types';
import {
  COLORS,
  FONT_SIZES,
  FONT_WEIGHTS,
  RADIUS,
  SPACING,
} from '../../constants/theme';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../context/ThemeContext';
import { formatINR, getInitials, formatDateTime } from '../../utils/formatters';

interface CustomerCardProps {
  customer: Customer;
  onPress: () => void;
}

const AVATAR_COLORS = [
  '#16a34a', '#0891b2', '#7c3aed', '#db2777', '#d97706', '#dc2626',
];

export const CustomerCard = memo(function CustomerCard({ customer, onPress }: CustomerCardProps) {
  const { t, i18n } = useTranslation();
  const { isDark, colors } = useAppTheme();
  const hasBalance = customer.balance > 0;

  // Avatar background based on name hash
  const colorIndex = customer.name
    ? customer.name.charCodeAt(0) % AVATAR_COLORS.length
    : 0;
  const avatarBg = AVATAR_COLORS[colorIndex];

  // Capture the date and time of latest activity, transaction, or creation
  const activityTimestamp =
    customer.lastTransactionAt ||
    customer.updatedAt ||
    customer.createdAt;
  const formattedDateTime = formatDateTime(activityTimestamp, i18n.language);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      delayPressIn={0}
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceCard,
          borderColor: isDark ? colors.border : '#f1f5f9',
          borderWidth: 1,
        },
      ]}
    >
      {/* Avatar */}
      <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
        <Text style={styles.initials}>{getInitials(customer.name)}</Text>
      </View>

      {/* Info */}
      <View style={styles.info}>
        <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{customer.name}</Text>
        <Text style={[styles.phone, { color: colors.textSecondary }]}>{customer.phone || t('customers.noPhone')}</Text>

        <View style={styles.bottomSection}>
          {hasBalance ? (
            <View style={styles.balanceRow}>
              <Ionicons
                name="time-outline"
                size={12}
                color={colors.danger}
              />
              <Text
                style={[
                  styles.balanceLabel,
                  { color: colors.danger },
                ]}
              >
                {' '}{t('common.due')}: {formatINR(customer.balance)}
              </Text>
            </View>
          ) : (
            <View style={styles.balanceRow}>
              <Ionicons
                name="checkmark-circle-outline"
                size={12}
                color={colors.primary}
              />
              <Text style={[styles.cleared, { color: colors.primary }]}>
                {' '}{t('common.allCleared')}
              </Text>
            </View>
          )}

          {formattedDateTime ? (
            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={11} color={colors.textMuted} />
              <Text style={[styles.dateText, { color: colors.textMuted }]}>{formattedDateTime}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Right arrow */}
      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
    marginBottom: SPACING[2],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardPressed: {
    opacity: 0.72,
    transform: [{ scale: 0.985 }],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  initials: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  info: {
    flex: 1,
  },
  name: {
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginBottom: 2,
  },
  phone: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: 3,
  },
  bottomSection: {
    marginTop: 1,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  balanceLabel: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  cleared: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.medium,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  dateText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    fontWeight: FONT_WEIGHTS.medium,
  },
});

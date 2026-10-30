import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import {
  COLORS,
  FONT_SIZES,
  FONT_WEIGHTS,
  RADIUS,
  SPACING,
} from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';

type BadgeVariant = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'primary';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  style?: ViewStyle;
  dot?: boolean;
}

export function Badge({ label, variant = 'neutral', style, dot = false }: BadgeProps) {
  const { colors, isDark } = useAppTheme();

  const variantColors: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
    success: {
      bg: isDark ? colors.successLight : COLORS.successLight,
      text: colors.success,
      dot: colors.success,
    },
    danger: {
      bg: isDark ? colors.dangerLight : COLORS.dangerLight,
      text: colors.danger,
      dot: colors.danger,
    },
    warning: {
      bg: isDark ? colors.warningLight : COLORS.warningLight,
      text: colors.gold,
      dot: colors.warning,
    },
    info: {
      bg: isDark ? colors.infoLight : COLORS.infoLight,
      text: colors.info,
      dot: colors.info,
    },
    neutral: {
      bg: isDark ? colors.surfaceCard : COLORS.borderLight,
      text: colors.textSecondary,
      dot: colors.textMuted,
    },
    primary: {
      bg: isDark ? colors.primaryLight : COLORS.primaryLight,
      text: colors.primary,
      dot: colors.primary,
    },
  };

  const current = variantColors[variant];

  return (
    <View style={[styles.badge, { backgroundColor: current.bg }, style]}>
      {dot && (
        <View style={[styles.dot, { backgroundColor: current.dot }]} />
      )}
      <Text style={[styles.label, { color: current.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING[2],
    paddingVertical: 3,
    borderRadius: RADIUS.full,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: SPACING[1],
  },
  label: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    letterSpacing: 0.3,
  },
});

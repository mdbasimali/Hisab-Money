import React, { memo } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  View,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
}

export const Button = memo(function Button({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  icon,
  iconRight,
  fullWidth = false,
  style,
  textStyle,
}: ButtonProps) {
  const { colors, isDark } = useAppTheme();
  const isDisabled = disabled || loading;

  const spinnerColor =
    variant === 'outline' || variant === 'ghost' ? colors.primary : '#ffffff';

  const dynamicVariantStyle: StyleProp<ViewStyle> = isDark
    ? variant === 'outline'
      ? { backgroundColor: 'transparent', borderColor: colors.primary }
      : variant === 'secondary'
      ? { backgroundColor: colors.primaryLight, borderColor: colors.primaryDark }
      : undefined
    : undefined;

  const dynamicLabelStyle: StyleProp<TextStyle> = isDark
    ? variant === 'outline'
      ? { color: colors.primary }
      : variant === 'secondary'
      ? { color: colors.primary }
      : variant === 'ghost'
      ? { color: colors.textSecondary }
      : undefined
    : undefined;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.75}
      delayPressIn={0}
      hitSlop={size === 'sm' ? { top: 8, bottom: 8, left: 8, right: 8 } : undefined}
      style={[
        styles.base,
        styles[variant],
        dynamicVariantStyle,
        styles[`size_${size}`],
        fullWidth && styles.fullWidth,
        isDisabled && !loading && styles.disabled,
        loading && styles.loadingState,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={spinnerColor}
            style={styles.spinner}
          />
        ) : (
          icon && <View style={styles.iconLeft}>{icon}</View>
        )}
        <Text
          style={[
            styles.label,
            styles[`label_${variant}`],
            dynamicLabelStyle,
            styles[`label_${size}`],
            textStyle,
          ]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {!loading && iconRight && <View style={styles.iconRight}>{iconRight}</View>}
      </View>
    </TouchableOpacity>
  );
});

const styles = StyleSheet.create({
  base: {
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconLeft: { marginRight: SPACING[2] },
  iconRight: { marginLeft: SPACING[2] },
  spinner: { marginRight: SPACING[2] },
  fullWidth: { width: '100%' },
  disabled: {
    opacity: 0.6,
  },
  loadingState: {
    opacity: 0.92,
  },
  pressed: {
    opacity: 0.78,
    transform: [{ scale: 0.985 }],
  },

  // Variants
  primary: {
    backgroundColor: '#16a34a', // Solid Hisab Money green
    borderWidth: 1,
    borderColor: '#15803d',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  secondary: {
    backgroundColor: '#dcfce7',
    borderWidth: 1,
    borderColor: '#bbf7d0',
  },
  outline: {
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#16a34a',
  },
  ghost: {
    backgroundColor: 'transparent',
  },
  danger: {
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#dc2626',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },

  // Sizes with minimum height guarantees
  size_sm: {
    minHeight: 38,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2] - 2,
    borderRadius: RADIUS.md,
  },
  size_md: {
    minHeight: 46,
    paddingHorizontal: SPACING[5],
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.lg,
  },
  size_lg: {
    minHeight: 52, // Guarantees 52dp height for primary forms
    paddingHorizontal: SPACING[6],
    paddingVertical: SPACING[4] - 2,
    borderRadius: RADIUS.xl,
  },

  // Labels
  label: {
    fontWeight: FONT_WEIGHTS.bold,
  },
  label_primary: {
    color: '#ffffff', // Pure readable white
  },
  label_secondary: {
    color: '#15803d',
  },
  label_outline: {
    color: '#16a34a',
  },
  label_ghost: {
    color: '#4b5563', // Readable neutral slate gray for secondary actions
  },
  label_danger: {
    color: '#ffffff',
  },

  label_sm: { fontSize: FONT_SIZES.sm },
  label_md: { fontSize: FONT_SIZES.base },
  label_lg: { fontSize: FONT_SIZES.md },
});

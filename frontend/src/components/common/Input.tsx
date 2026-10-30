import React, { useState, useCallback, forwardRef, memo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TextInputProps,
  TouchableOpacity,
  StyleProp,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  COLORS,
  FONT_SIZES,
  FONT_WEIGHTS,
  RADIUS,
  SPACING,
} from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';

export interface InputProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  prefix?: string;
  password?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<TextStyle>;
}

export const Input = memo(
  forwardRef<any, InputProps>(function Input(
    {
      label,
      error,
      hint,
      leftIcon,
      rightIcon,
      prefix,
      password = false,
      onFocus,
      onBlur,
      multiline,
      style,
      containerStyle,
      editable = true,
      autoCorrect = false,
      spellCheck = false,
      ...props
    },
    ref
  ) {
    const { isDark, colors } = useAppTheme();
    const [focused, setFocused] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleFocus = useCallback(
      (e: any) => {
        setFocused(true);
        onFocus?.(e);
      },
      [onFocus]
    );

    const handleBlur = useCallback(
      (e: any) => {
        setFocused(false);
        onBlur?.(e);
      },
      [onBlur]
    );

    return (
      <View style={styles.wrapper}>
        {label && <Text style={[styles.label, { color: colors.textPrimary }]}>{label}</Text>}

        <View
          style={[
            styles.inputContainer,
            {
              backgroundColor: isDark ? colors.surfaceCard : COLORS.surface,
              borderColor: !!error
                ? colors.danger
                : focused
                ? colors.primary
                : isDark
                ? colors.border
                : COLORS.border,
            },
            multiline && styles.multilineContainer,
            focused && styles.focused,
            !!error && styles.hasError,
            !editable && styles.disabledContainer,
            containerStyle,
          ]}
        >
          {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
          {prefix && <Text style={[styles.prefix, { color: colors.textSecondary }]}>{prefix}</Text>}

          <TextInput
            ref={ref}
            style={[
              styles.input,
              { color: colors.textPrimary },
              multiline && styles.multilineInput,
              !editable && styles.disabledInput,
              style,
            ]}
            placeholderTextColor={colors.textMuted}
            secureTextEntry={password && !showPassword}
            onFocus={handleFocus}
            onBlur={handleBlur}
            multiline={multiline}
            textAlignVertical={multiline ? 'top' : 'center'}
            editable={editable}
            autoCorrect={autoCorrect}
            spellCheck={spellCheck}
            {...props}
          />

          {password && (
            <TouchableOpacity
              onPress={() => setShowPassword((v) => !v)}
              style={styles.rightIcon}
              activeOpacity={0.7}
            >
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={COLORS.textSecondary}
              />
            </TouchableOpacity>
          )}
          {rightIcon && !password && (
            <View style={styles.rightIcon}>{rightIcon}</View>
          )}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}
        {hint && !error && <Text style={styles.hintText}>{hint}</Text>}
      </View>
    );
  })
);

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: SPACING[4],
  },
  label: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
    marginBottom: SPACING[1],
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING[3],
    minHeight: 52,
  },
  multilineContainer: {
    minHeight: 80,
    alignItems: 'flex-start',
    paddingVertical: SPACING[2],
  },
  focused: {
    borderColor: COLORS.primary,
  },
  hasError: {
    borderColor: COLORS.danger,
  },
  disabledContainer: {
    backgroundColor: '#f3f4f6',
    borderColor: '#e5e7eb',
  },
  disabledInput: {
    color: COLORS.textSecondary,
  },
  leftIcon: {
    marginRight: SPACING[2],
  },
  rightIcon: {
    marginLeft: SPACING[2],
  },
  prefix: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textSecondary,
    marginRight: SPACING[1],
  },
  input: {
    flex: 1,
    fontSize: FONT_SIZES.base,
    color: COLORS.textPrimary,
    paddingVertical: SPACING[3],
  },
  multilineInput: {
    paddingVertical: SPACING[1],
    minHeight: 58,
  },
  errorText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.danger,
    marginTop: SPACING[1],
  },
  hintText: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: SPACING[1],
  },
});

import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';

interface ContactsPermissionModalProps {
  visible: boolean;
  onAllow: () => void;
  onMaybeLater: () => void;
}

export function ContactsPermissionModal({
  visible,
  onAllow,
  onMaybeLater,
}: ContactsPermissionModalProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onMaybeLater}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            {
              backgroundColor: colors.surfaceCard,
              borderColor: colors.border,
            },
          ]}
        >
          {/* Top Decorative Icon */}
          <View style={styles.iconContainer}>
            <View style={[styles.iconCircle, { backgroundColor: isDark ? '#064e3b' : '#dcfce7' }]}>
              <Ionicons name="people" size={32} color={colors.primary} />
            </View>
          </View>

          {/* Title */}
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('contacts.connectTitle', 'Connect Your Contacts')}
          </Text>

          {/* Privacy Badge */}
          <View style={[styles.privacyBadge, { backgroundColor: isDark ? '#14532d' : '#ecfdf5', borderColor: colors.primary }]}>
            <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
            <Text style={[styles.privacyBadgeText, { color: colors.primary }]}>
              {t('contacts.localPrivacyBadge', '100% Private & Device-Only')}
            </Text>
          </View>

          {/* Feature Explanations */}
          <View style={styles.featuresList}>
            <View style={styles.featureItem}>
              <View style={[styles.featureBullet, { backgroundColor: isDark ? '#064e3b' : '#dcfce7' }]}>
                <Ionicons name="checkmark" size={16} color={colors.primary} />
              </View>
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>
                {t('contacts.feature1', 'Find customers from phone contacts.')}
              </Text>
            </View>

            <View style={styles.featureItem}>
              <View style={[styles.featureBullet, { backgroundColor: isDark ? '#064e3b' : '#dcfce7' }]}>
                <Ionicons name="checkmark" size={16} color={colors.primary} />
              </View>
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>
                {t('contacts.feature2', 'Automatically fill customer name and phone number.')}
              </Text>
            </View>

            <View style={styles.featureItem}>
              <View style={[styles.featureBullet, { backgroundColor: isDark ? '#064e3b' : '#dcfce7' }]}>
                <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
              </View>
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>
                {t('contacts.feature3', 'Contacts are not uploaded to the Hisab Money server.')}
              </Text>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary }]}
              onPress={onAllow}
              activeOpacity={0.8}
            >
              <Ionicons name="person-add-outline" size={18} color="#ffffff" style={{ marginRight: 6 }} />
              <Text style={styles.primaryBtnText}>
                {t('contacts.allowAccess', 'Allow Contacts Access')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.secondaryBtn, { borderColor: colors.border }]}
              onPress={onMaybeLater}
              activeOpacity={0.7}
            >
              <Text style={[styles.secondaryBtnText, { color: colors.textSecondary }]}>
                {t('contacts.maybeLater', 'Maybe Later')}
              </Text>
            </TouchableOpacity>
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
    maxWidth: 380,
    borderRadius: RADIUS.xl,
    padding: SPACING[5],
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: SPACING[3],
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
  privacyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingHorizontal: SPACING[3],
    paddingVertical: 4,
    borderRadius: RADIUS.full,
    borderWidth: 0.5,
    marginBottom: SPACING[4],
  },
  privacyBadgeText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  featuresList: {
    gap: SPACING[3],
    marginBottom: SPACING[5],
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING[3],
  },
  featureBullet: {
    width: 26,
    height: 26,
    borderRadius: 13,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 1,
  },
  featureText: {
    flex: 1,
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
    fontWeight: FONT_WEIGHTS.medium,
  },
  actions: {
    gap: SPACING[2],
  },
  primaryBtn: {
    flexDirection: 'row',
    height: 48,
    borderRadius: RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING[4],
  },
  primaryBtnText: {
    color: '#ffffff',
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  secondaryBtn: {
    height: 44,
    borderRadius: RADIUS.lg,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.semibold,
  },
});


import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  StatusBar as RNStatusBar,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { useAppTheme } from '../../context/ThemeContext';
import { CURRENT_PRIVACY_POLICY_VERSION, PRIVACY_POLICY_EFFECTIVE_DATE } from '../../services/privacyConsentService';

interface PrivacyPolicyModalProps {
  visible: boolean;
  onClose: () => void;
  onAccept?: () => void;
  showAcceptButton?: boolean;
}

export function PrivacyPolicyModal({
  visible,
  onClose,
  onAccept,
  showAcceptButton = false,
}: PrivacyPolicyModalProps) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const insets = useSafeAreaInsets();

  // Ensure plenty of safe breathing room below the Android status bar / camera notch / clock
  const topInset = Platform.OS === 'android'
    ? Math.max(RNStatusBar.currentHeight || 0, insets.top || 0, 28)
    : Math.max(insets.top || 0, 16);

  const bottomInset = Math.max(insets.bottom || 0, 12);

  const handleOpenEmail = () => {
    Linking.openURL('mailto:support.hisabmoney@gmail.com');
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        {/* Topbar Header with Safe Area Inset Handling */}
        <View
          style={[
            styles.headerWrapper,
            {
              backgroundColor: colors.white,
              paddingTop: topInset + 6,
              borderBottomColor: colors.borderLight,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={[styles.shieldIconWrapper, { backgroundColor: isDark ? '#064e3b' : '#dcfce7' }]}>
                <Ionicons name="shield-checkmark" size={22} color="#16a34a" />
              </View>
              <View style={styles.headerTitleContainer}>
                <Text style={[styles.headerTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                  {t('privacy.policyModalTitle')}
                </Text>
                <Text style={[styles.headerSub, { color: colors.textMuted }]} numberOfLines={1}>
                  {t('privacy.version', { version: CURRENT_PRIVACY_POLICY_VERSION })} · {t('privacy.effectiveDate', { date: PRIVACY_POLICY_EFFECTIVE_DATE })}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.closeBtn, { backgroundColor: isDark ? '#334155' : '#f1f5f9' }]}
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
              delayPressIn={0}
              accessibilityRole="button"
              accessibilityLabel={t('privacy.close')}
            >
              <Ionicons name="close" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Topbar Support Email Pill */}
          <TouchableOpacity
            style={[
              styles.topbarSupportPill,
              {
                backgroundColor: isDark ? '#1e293b' : '#eff6ff',
                borderColor: isDark ? '#3b82f6' : '#bfdbfe',
              },
            ]}
            activeOpacity={0.7}
            delayPressIn={0}
            onPress={handleOpenEmail}
          >
            <View style={styles.topbarSupportPillInner}>
              <Ionicons name="mail" size={13} color="#2563eb" />
              <Text style={[styles.topbarSupportLabel, { color: colors.textSecondary }]}>
                {t('privacy.supportLabel', { defaultValue: 'Support:' })}
              </Text>
              <Text style={styles.topbarSupportEmail}>support.hisabmoney@gmail.com</Text>
            </View>
            <Ionicons name="open-outline" size={13} color="#2563eb" />
          </TouchableOpacity>
        </View>

        {/* Scrollable Policy Body */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={true}
        >
          {/* Badge Summary Card */}
          <View style={[styles.badgeCard, { backgroundColor: isDark ? '#1e293b' : '#f0fdf4', borderColor: isDark ? colors.border : '#bbf7d0' }]}>
            <View style={styles.badgeRow}>
              <Ionicons name="lock-closed" size={18} color="#16a34a" />
              <Text style={[styles.badgeTitle, { color: isDark ? '#4ade80' : '#15803d' }]}>
                {t('privacy.summaryHeadline')}
              </Text>
            </View>
            <Text style={[styles.badgeDesc, { color: isDark ? '#cbd5e1' : '#166534' }]}>
              {t('privacy.summarySubtext')}
            </Text>
          </View>

          {/* Section 1: Overview & Data Ownership */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('privacy.sec1Title')}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {t('privacy.sec1Body')}
            </Text>
          </View>

          {/* Section 2: Local SQLite Storage & Zero Tracking */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('privacy.sec2Title')}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {t('privacy.sec2Body')}
            </Text>
          </View>

          {/* Section 3: Google Sign-In & Authentication */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('privacy.sec3Title')}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {t('privacy.sec3Body')}
            </Text>
          </View>

          {/* Section 4: Google Drive Cloud Backups */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('privacy.sec4Title')}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {t('privacy.sec4Body')}
            </Text>
          </View>

          {/* Section 5: SMS Notifications & Reminders */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('privacy.sec5Title')}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {t('privacy.sec5Body')}
            </Text>
          </View>

          {/* Section 6: Data Rights, Export & Deletion */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('privacy.sec6Title')}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {t('privacy.sec6Body')}
            </Text>
          </View>

          {/* Section 7: Policy Updates & Material Changes */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('privacy.sec7Title')}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {t('privacy.sec7Body')}
            </Text>
          </View>

          {/* Section 8: Support & Inquiries */}
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
              {t('privacy.sec8Title')}
            </Text>
            <Text style={[styles.sectionBody, { color: colors.textSecondary }]}>
              {t('privacy.sec8Body')}
            </Text>
            
            {/* Interactive Support Card */}
            <TouchableOpacity
              style={[
                styles.contactCard,
                {
                  backgroundColor: isDark ? '#1e293b' : '#eff6ff',
                  borderColor: isDark ? '#3b82f6' : '#bfdbfe',
                },
              ]}
              activeOpacity={0.7}
              delayPressIn={0}
              onPress={handleOpenEmail}
            >
              <View style={[styles.contactCardIcon, { backgroundColor: isDark ? '#1e3a8a' : '#dbeafe' }]}>
                <Ionicons name="mail" size={20} color="#2563eb" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.contactCardTitle, { color: colors.textPrimary }]}>
                  {t('privacy.supportLabel', { defaultValue: 'Official Support Email' })}
                </Text>
                <Text style={styles.contactCardEmail}>support.hisabmoney@gmail.com</Text>
              </View>
              <Ionicons name="open-outline" size={18} color="#2563eb" />
            </TouchableOpacity>
          </View>

          <View style={{ height: SPACING[6] }} />
        </ScrollView>

        {/* Footer Actions */}
        <View style={[styles.footer, { backgroundColor: colors.white, borderTopColor: colors.borderLight, paddingBottom: bottomInset }]}>
          {showAcceptButton && onAccept ? (
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.borderLight }]}
                onPress={onClose}
                activeOpacity={0.7}
                delayPressIn={0}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                  {t('privacy.close')}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.acceptBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  onAccept();
                  onClose();
                }}
                activeOpacity={0.8}
                delayPressIn={0}
              >
                <Ionicons name="checkmark-circle" size={18} color="#ffffff" style={{ marginRight: 6 }} />
                <Text style={styles.acceptBtnText}>{t('privacy.acceptAndClose')}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.fullCloseBtn, { backgroundColor: colors.primary }]}
              onPress={onClose}
              activeOpacity={0.8}
              delayPressIn={0}
            >
              <Text style={styles.fullCloseBtnText}>{t('privacy.close')}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerWrapper: {
    borderBottomWidth: 1,
    paddingHorizontal: SPACING[4],
    paddingBottom: SPACING[3],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING[2],
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
    flex: 1,
  },
  shieldIconWrapper: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FONT_SIZES.md + 1,
    fontWeight: FONT_WEIGHTS.bold,
  },
  headerSub: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: SPACING[2],
  },
  topbarSupportPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING[3],
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    borderWidth: 1,
    marginTop: 2,
  },
  topbarSupportPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  topbarSupportLabel: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.medium,
  },
  topbarSupportEmail: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#2563eb',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING[4],
  },
  badgeCard: {
    borderRadius: RADIUS.lg,
    padding: SPACING[3],
    borderWidth: 1,
    marginBottom: SPACING[4],
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    marginBottom: 4,
  },
  badgeTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  badgeDesc: {
    fontSize: FONT_SIZES.xs,
    lineHeight: 18,
  },
  section: {
    marginBottom: SPACING[4],
  },
  sectionTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: SPACING[1],
  },
  sectionBody: {
    fontSize: FONT_SIZES.xs + 1,
    lineHeight: 20,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING[3],
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: SPACING[2],
    gap: SPACING[3],
  },
  contactCardIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactCardTitle: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.medium,
  },
  contactCardEmail: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#2563eb',
    marginTop: 1,
  },
  footer: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    borderTopWidth: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: SPACING[3],
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  acceptBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    color: '#ffffff',
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  fullCloseBtn: {
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullCloseBtnText: {
    color: '#ffffff',
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

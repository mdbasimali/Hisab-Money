import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../types';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, SPACING, RADIUS } from '../../constants/theme';
import { ApiService } from '../../services/apiService';
import { AuthService, AuthUser } from '../../services/authService';
import { GoogleDriveBackupService } from '../../services/googleDriveService';
import { useTranslation } from 'react-i18next';
import { useAppTheme } from '../../context/ThemeContext';
import {
  PrivacyConsentService,
  CURRENT_PRIVACY_POLICY_VERSION,
} from '../../services/privacyConsentService';
import { PrivacyPolicyModal } from '../../components/common/PrivacyPolicyModal';
let GoogleSignin: any = null;
let statusCodes: any = {};

try {
  const RNSignIn = require('@react-native-google-signin/google-signin');
  GoogleSignin = RNSignIn.GoogleSignin;
  statusCodes = RNSignIn.statusCodes;
} catch (e) {
  // Expo Go environment: native turbo module is not present
}

type Props = NativeStackScreenProps<RootStackParamList, 'Login'> & {
  onLogin: () => void;
};

export function LoginScreen({ onLogin }: Props) {
  const { t } = useTranslation();
  const { colors, isDark } = useAppTheme();
  const [loading, setLoading] = React.useState(false);

  // Privacy Policy Consent State
  const [isConsentRequired, setIsConsentRequired] = React.useState(true);
  const [isAgreed, setIsAgreed] = React.useState(false);
  const [isPolicyUpdated, setIsPolicyUpdated] = React.useState(false);
  const [policyModalVisible, setPolicyModalVisible] = React.useState(false);

  // First-Login Google Drive Authorization State
  const [firstDriveModalVisible, setFirstDriveModalVisible] = React.useState(false);
  const [driveSetupLoading, setDriveSetupLoading] = React.useState(false);

  const googleClientIdWeb = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB;

  React.useEffect(() => {
    // Check existing persisted consent
    PrivacyConsentService.getStoredConsent().then((record) => {
      if (record.hasConsented && record.version) {
        const isOld =
          PrivacyConsentService.compareVersions(
            record.version,
            CURRENT_PRIVACY_POLICY_VERSION
          ) < 0;
        if (isOld) {
          // Material change: renewed consent is required
          setIsConsentRequired(true);
          setIsPolicyUpdated(true);
          setIsAgreed(false);
        } else {
          // Returning user who already consented to current version: do not re-prompt
          setIsConsentRequired(false);
          setIsPolicyUpdated(false);
          setIsAgreed(true);
        }
      } else {
        // First-time user: require consent before sign-in
        setIsConsentRequired(true);
        setIsPolicyUpdated(false);
        setIsAgreed(false);
      }
    });
  }, []);

  React.useEffect(() => {
    if (GoogleSignin) {
      try {
        GoogleSignin.configure({
          webClientId: googleClientIdWeb,
          offlineAccess: false,
        });
      } catch (e) {
        console.warn('[GoogleSignin] configure warning:', e);
      }
    }
  }, [googleClientIdWeb]);

  const handleGoogleSignIn = async () => {
    if (!isAgreed) {
      Alert.alert(
        t('privacy.policyModalTitle'),
        t('privacy.consentRequiredHint')
      );
      return;
    }

    setLoading(true);
    try {
      if (!GoogleSignin) {
        Alert.alert(
          'Google Sign-In Notice',
          'Google Sign-In is unavailable in this environment. Please ensure Google Play Services is available on your device.'
        );
        setLoading(false);
        return;
      }

      let isHealthy = await ApiService.checkHealth();
      if (!isHealthy) {
        // Quick retry in case device network interface was momentarily dormant
        await new Promise((res) => setTimeout(res, 600));
        isHealthy = await ApiService.checkHealth();
      }

      if (!isHealthy) {
        Alert.alert(
          'Connection Error',
          'Unable to connect to the server. Please check your network connection and try again.'
        );
        setLoading(false);
        return;
      }

      // Native Android Google Play Services account picker bottom sheet
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      
      // Clear previously selected cached account so the Google account picker always prompts
      try {
        await GoogleSignin.signOut();
      } catch (e) {
        // Safe to ignore if not signed in
      }

      const signInResult = await GoogleSignin.signIn();
      const idToken = signInResult.data?.idToken || (signInResult as any).idToken;

      if (!idToken) {
        throw new Error('Unable to complete Google Sign-In. Please try again.');
      }

      // Extract client-side Google profile info (name, email, picture/photo)
      const googleUser = signInResult.data?.user || (signInResult as any).user;
      const googlePhoto = googleUser?.photo || googleUser?.picture || null;
      const googleName = googleUser?.name || null;
      const googleEmail = googleUser?.email || null;

      // Verify session securely with server
      const authRes = await ApiService.googleLogin(idToken);
      if (authRes.success && authRes.data) {
        await AuthService.setToken(authRes.data.token);

        const resolvedPhoto =
          authRes.data.user?.avatarUrl ||
          authRes.data.user?.picture ||
          googlePhoto ||
          undefined;

        const resolvedUser: AuthUser = {
          ...authRes.data.user,
          name: authRes.data.user?.name || googleName || 'Google User',
          email: authRes.data.user?.email || googleEmail || '',
          avatarUrl: resolvedPhoto,
          picture: resolvedPhoto,
        };

        await AuthService.setUser(resolvedUser);

        // Explicitly record user Privacy Policy consent with version & timestamp
        await PrivacyConsentService.recordConsent(CURRENT_PRIVACY_POLICY_VERSION);

        // When a real user logs in, ensure old hardcoded demo records are purged
        try {
          const { getDatabase } = require('../../database/db');
          const db = await getDatabase();
          await db.execAsync(`
            DELETE FROM sync_queue WHERE entity_id IN ('c-1', 'c-2', 'c-3', 'p-1', 'p-2', 'p-3');
            DELETE FROM payments WHERE customer_id IN ('c-1', 'c-2', 'c-3') OR id IN ('p-1', 'p-2', 'p-3');
            DELETE FROM due_transactions WHERE customer_id IN ('c-1', 'c-2', 'c-3');
            DELETE FROM customers WHERE id IN ('c-1', 'c-2', 'c-3');
          `);
        } catch (dbErr) {
          console.warn('[LoginScreen] Error cleaning legacy demo records:', dbErr);
        }

        // First-login check: Automatically initiate Google Drive connection on first login
        const isDriveAvail = GoogleDriveBackupService.isDriveAvailable();
        const isDriveConn = await GoogleDriveBackupService.isDriveConnected();
        const isPromptHandled = await GoogleDriveBackupService.isFirstDrivePromptHandled();

        if (isDriveAvail && !isDriveConn && !isPromptHandled) {
          setFirstDriveModalVisible(true);
        } else {
          onLogin();
        }
      } else {
        Alert.alert('Sign-In Failed', authRes.message || 'Unable to sign in right now. Please try again.');
      }
    } catch (err: any) {
      if (err.code === statusCodes?.SIGN_IN_CANCELLED) {
        // User dismissed the bottom sheet
      } else if (err.code === statusCodes?.IN_PROGRESS) {
        // Sign-in operation already in progress
      } else if (err.code === statusCodes?.PLAY_SERVICES_NOT_AVAILABLE) {
        Alert.alert('Google Play Services', 'Google Play Services is not available or outdated on this device.');
      } else {
        Alert.alert('Sign-In Error', err?.message || 'Google Sign-In failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleApproveDrive = async () => {
    setDriveSetupLoading(true);
    try {
      const res = await GoogleDriveBackupService.handleFirstLoginDriveSetup();
      setDriveSetupLoading(false);
      setFirstDriveModalVisible(false);

      if (!res.connected) {
        Alert.alert(
          'Google Drive Authorization',
          res.message || 'Drive authorization was not completed. Cloud backup is waiting in Settings.',
          [{ text: 'Continue to App', onPress: onLogin }]
        );
        return;
      }

      // Scenario A: Existing cloud backup found, local DB is empty -> candidate for restore
      if (res.remoteSnapshot && res.localCount === 0 && res.remoteFileId) {
        Alert.alert(
          'Restore Cloud Backup?',
          `Found an existing backup in Google Drive with ${res.remoteCount} customers, ${res.remoteSnapshot.duesCount} dues, and ${res.remoteSnapshot.paymentsCount} payments.\n\nWould you like to restore your ledger now?`,
          [
            {
              text: 'Start Fresh',
              style: 'cancel',
              onPress: onLogin,
            },
            {
              text: 'Restore Now',
              onPress: async () => {
                setLoading(true);
                try {
                  const restoreRes = await GoogleDriveBackupService.restoreBackupFromDrive(res.remoteFileId!);
                  Alert.alert('✅ Restored', restoreRes.message || 'Ledger records recovered successfully.', [
                    { text: 'OK', onPress: onLogin },
                  ]);
                } catch (e: any) {
                  Alert.alert('Restore Error', e?.message || 'Failed to restore cloud backup.', [
                    { text: 'OK', onPress: onLogin },
                  ]);
                } finally {
                  setLoading(false);
                }
              },
            },
          ]
        );
        return;
      }

      // Scenario B: Conflict detected (both local records and cloud backup exist)
      if (res.hasConflict && res.remoteFileId) {
        Alert.alert(
          'Ledger Records Detected',
          `You have ${res.localCount} customers stored on this device, and ${res.remoteCount} customers backed up on Google Drive.\n\nNever silently overwrite: would you like to restore cloud backup or keep local records?`,
          [
            {
              text: 'Keep Local',
              onPress: async () => {
                try {
                  await GoogleDriveBackupService.uploadBackupToDrive();
                } catch {}
                onLogin();
              },
            },
            {
              text: 'Restore Cloud',
              onPress: async () => {
                setLoading(true);
                try {
                  await GoogleDriveBackupService.restoreBackupFromDrive(res.remoteFileId!);
                } catch {}
                setLoading(false);
                onLogin();
              },
            },
            {
              text: 'Decide in Settings',
              style: 'cancel',
              onPress: onLogin,
            },
          ]
        );
        return;
      }

      // Fresh user or initial backup done
      Alert.alert(
        '✅ Google Drive Connected',
        res.message || 'Google Drive connected successfully. Always-on cloud backup is active for your ledger.',
        [{ text: 'Continue', onPress: onLogin }]
      );
    } catch (err: any) {
      setDriveSetupLoading(false);
      setFirstDriveModalVisible(false);
      Alert.alert('Google Drive', err?.message || 'Failed to connect Google Drive.', [
        { text: 'Continue', onPress: onLogin },
      ]);
    }
  };

  const handleDeclineDrive = async () => {
    await GoogleDriveBackupService.setFirstDrivePromptHandled(true);
    setFirstDriveModalVisible(false);
    Alert.alert(
      'Cloud Backup Notice',
      'Google Drive authorization was skipped. Cloud backup is waiting for Drive authorization. You can connect anytime from Settings.',
      [{ text: 'Continue to App', onPress: onLogin }]
    );
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: isDark ? colors.background : COLORS.primaryLighter }]}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Background decoration */}
        <View style={[styles.bgCircle1, isDark && { opacity: 0.15 }]} />
        <View style={[styles.bgCircle2, isDark && { opacity: 0.1 }]} />

        {/* Logo & Brand */}
        <View style={styles.brandContainer}>
          <View style={styles.logoContainer}>
            <Ionicons name="calculator" size={40} color={COLORS.white} />
          </View>
          <Text style={[styles.appName, { color: isDark ? colors.textPrimary : COLORS.primaryDarker }]}>Hisab Money</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>हिसाब मनी — Your Business Ledger</Text>
        </View>

        {/* Features list */}
        <View style={[styles.featuresCard, { backgroundColor: colors.surfaceCard, borderColor: colors.border, borderWidth: isDark ? 1 : 0 }]}>
          {[
            { icon: 'people', text: 'Manage customers & credit easily' },
            { icon: 'receipt', text: 'Track all credit & payment records' },
            { icon: 'analytics', text: 'View outstanding balances at a glance' },
            { icon: 'notifications', text: 'Send payment reminders via SMS' },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={[styles.featureIcon, { backgroundColor: isDark ? colors.surface : COLORS.primaryLighter }]}>
                <Ionicons name={f.icon as keyof typeof Ionicons.glyphMap} size={18} color={colors.primary} />
              </View>
              <Text style={[styles.featureText, { color: colors.textPrimary }]}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* Auth Section */}
        <View style={styles.authSection}>
          {/* Updated Policy Banner if user had accepted an older version */}
          {isPolicyUpdated && (
            <View
              style={[
                styles.updatedBanner,
                {
                  backgroundColor: isDark ? '#082f49' : '#e0f2fe',
                  borderColor: isDark ? '#0284c7' : '#bae6fd',
                },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={18}
                color="#0284c7"
                style={{ marginRight: SPACING[2] }}
              />
              <Text
                style={[
                  styles.updatedBannerText,
                  { color: isDark ? '#bae6fd' : '#0369a1' },
                ]}
              >
                {t('privacy.updatedNoticeMsg', {
                  version: CURRENT_PRIVACY_POLICY_VERSION,
                })}
              </Text>
            </View>
          )}

          {/* Privacy Policy Consent Checkbox */}
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setIsAgreed(!isAgreed)}
            activeOpacity={0.7}
            delayPressIn={0}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: isAgreed }}
            accessibilityLabel={`${t('privacy.checkboxAgree')} ${t('privacy.policyLink')}`}
          >
            <View
              style={[
                styles.checkboxBox,
                {
                  borderColor: isAgreed ? colors.primary : colors.textMuted,
                  backgroundColor: isAgreed ? colors.primary : 'transparent',
                },
              ]}
            >
              {isAgreed && <Ionicons name="checkmark" size={15} color="#ffffff" />}
            </View>
            <View style={styles.consentTextWrapper}>
              <Text style={[styles.consentText, { color: colors.textSecondary }]}>
                {t('privacy.checkboxAgree')}{' '}
                <Text
                  style={[styles.policyLinkText, { color: colors.primary }]}
                  onPress={(e) => {
                    e.stopPropagation();
                    setPolicyModalVisible(true);
                  }}
                >
                  {t('privacy.policyLink')}
                </Text>
                .
              </Text>
            </View>
          </TouchableOpacity>

          {/* Disabled Explanation Warning */}
          {!isAgreed && (
            <View
              style={[
                styles.warningBox,
                {
                  backgroundColor: isDark ? '#451a03' : '#fffbeb',
                  borderColor: isDark ? '#78350f' : '#fde68a',
                },
              ]}
            >
              <Ionicons
                name="alert-circle-outline"
                size={16}
                color="#d97706"
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.warningText,
                  { color: isDark ? '#fde68a' : '#b45309' },
                ]}
              >
                {t('privacy.consentRequiredHint')}
              </Text>
            </View>
          )}

          {/* Real Google Sign-In */}
          <TouchableOpacity
            style={[
              styles.googleButton,
              { backgroundColor: colors.surfaceCard, borderColor: colors.border },
              (!isAgreed || loading) && styles.googleButtonDisabled,
            ]}
            onPress={handleGoogleSignIn}
            disabled={!isAgreed || loading}
            activeOpacity={0.85}
            delayPressIn={0}
          >
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <View style={[styles.googleIcon, !isAgreed && { opacity: 0.5 }]}>
                  <Text style={styles.googleG}>G</Text>
                </View>
                <Text
                  style={[
                    styles.googleText,
                    { color: isAgreed ? colors.textPrimary : colors.textMuted },
                  ]}
                >
                  Sign in with Google
                </Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
            100% Private & Offline · Your data is securely saved on your device.
          </Text>
        </View>

        {/* Footer */}
        <Text style={[styles.footer, { color: colors.textMuted }]}>
          Hisab Money — Safe & Reliable Digital Ledger
        </Text>
      </ScrollView>

      {/* Accessible In-App Privacy Policy Modal */}
      <PrivacyPolicyModal
        visible={policyModalVisible}
        onClose={() => setPolicyModalVisible(false)}
        onAccept={() => setIsAgreed(true)}
        showAcceptButton={!isAgreed}
      />

      {/* First-Login Google Drive Authorization Modal */}
      <Modal
        visible={firstDriveModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleDeclineDrive}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: isDark ? colors.surfaceCard : COLORS.white }]}>
            <View style={styles.driveModalHeader}>
              <View style={[styles.driveIconBadge, { backgroundColor: isDark ? '#1e3a5f' : '#eff6ff' }]}>
                <Ionicons name="cloud-upload" size={32} color={COLORS.primary} />
              </View>
              <Text style={[styles.driveModalTitle, { color: colors.textPrimary }]}>
                Enable Automatic Cloud Backup
              </Text>
              <Text style={[styles.driveModalSubtitle, { color: colors.textSecondary }]}>
                Hisab Money automatically backs up your business ledger to Google Drive so your customer records, dues, and payments are never lost.
              </Text>
            </View>

            <View style={[styles.driveBenefitsBox, { backgroundColor: isDark ? '#0f172a' : '#f8fafc', borderColor: colors.border }]}>
              <View style={styles.benefitRow}>
                <Ionicons name="shield-checkmark" size={18} color="#16a34a" />
                <Text style={[styles.benefitText, { color: colors.textPrimary }]}>
                  Always-on automatic cloud synchronization
                </Text>
              </View>
              <View style={styles.benefitRow}>
                <Ionicons name="refresh" size={18} color="#0284c7" />
                <Text style={[styles.benefitText, { color: colors.textPrimary }]}>
                  Seamless 1-tap recovery if you reinstall or switch phones
                </Text>
              </View>
              <View style={styles.benefitRow}>
                <Ionicons name="lock-closed" size={18} color="#ea580c" />
                <Text style={[styles.benefitText, { color: colors.textPrimary }]}>
                  Only accesses files created by Hisab Money in Drive
                </Text>
              </View>
            </View>

            {driveSetupLoading ? (
              <View style={styles.driveLoadingContainer}>
                <ActivityIndicator size="large" color={COLORS.primary} />
                <Text style={[styles.driveLoadingText, { color: colors.textSecondary }]}>
                  Connecting to Google Drive...
                </Text>
              </View>
            ) : (
              <View style={styles.driveModalButtons}>
                <TouchableOpacity
                  style={[styles.driveApproveBtn, { backgroundColor: COLORS.primary }]}
                  onPress={handleApproveDrive}
                  activeOpacity={0.8}
                >
                  <Ionicons name="logo-google" size={18} color={COLORS.white} style={{ marginRight: 8 }} />
                  <Text style={styles.driveApproveBtnText}>Connect Google Drive</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.driveDeclineBtn}
                  onPress={handleDeclineDrive}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.driveDeclineBtnText, { color: colors.textSecondary }]}>
                    Maybe Later (Connect in Settings)
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.primaryLighter,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: SPACING[5],
    paddingBottom: SPACING[8],
  },

  // Background decorations
  bgCircle1: {
    position: 'absolute',
    top: -60,
    right: -60,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.primaryLight,
    opacity: 0.8,
  },
  bgCircle2: {
    position: 'absolute',
    top: 100,
    left: -80,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: COLORS.primaryLight,
    opacity: 0.5,
  },

  // Brand
  brandContainer: {
    alignItems: 'center',
    paddingTop: SPACING[10],
    paddingBottom: SPACING[8],
  },
  logoContainer: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[4],
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  appName: {
    fontSize: FONT_SIZES['3xl'],
    fontWeight: FONT_WEIGHTS.extrabold,
    color: COLORS.primaryDarker,
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginTop: SPACING[1],
    textAlign: 'center',
  },

  // Features card
  featuresCard: {
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.xl,
    padding: SPACING[5],
    marginBottom: SPACING[6],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING[2],
  },
  featureIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.primaryLighter,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  featureText: {
    fontSize: FONT_SIZES.base,
    color: COLORS.textPrimary,
    flex: 1,
  },

  // Auth section
  authSection: {
    gap: SPACING[3],
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[3],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  googleIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4285F4',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  googleG: {
    color: COLORS.white,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  googleText: {
    flex: 1,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textPrimary,
  },
  disclaimer: {
    textAlign: 'center',
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: SPACING[2],
  },

  // Footer
  footer: {
    textAlign: 'center',
    fontSize: FONT_SIZES.xs,
    color: COLORS.textMuted,
    marginTop: SPACING[8],
  },

  // Privacy Policy Consent styles
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING[2],
    paddingHorizontal: 2,
  },
  checkboxBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  consentTextWrapper: {
    flex: 1,
  },
  consentText: {
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
  },
  policyLinkText: {
    fontWeight: FONT_WEIGHTS.bold,
    textDecorationLine: 'underline',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  warningText: {
    fontSize: FONT_SIZES.xs,
    flex: 1,
    lineHeight: 18,
  },
  updatedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    borderRadius: RADIUS.md,
    borderWidth: 1,
  },
  updatedBannerText: {
    fontSize: FONT_SIZES.xs,
    flex: 1,
    lineHeight: 18,
  },
  googleButtonDisabled: {
    opacity: 0.55,
  },

  // First-Login Drive Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING[4],
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: RADIUS.xl,
    padding: SPACING[6],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  driveModalHeader: {
    alignItems: 'center',
    marginBottom: SPACING[4],
  },
  driveIconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  driveModalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: SPACING[2],
  },
  driveModalSubtitle: {
    fontSize: FONT_SIZES.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  driveBenefitsBox: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING[3],
    gap: SPACING[2],
    marginBottom: SPACING[5],
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
  },
  benefitText: {
    flex: 1,
    fontSize: FONT_SIZES.xs,
    lineHeight: 18,
    fontWeight: FONT_WEIGHTS.medium,
  },
  driveLoadingContainer: {
    alignItems: 'center',
    paddingVertical: SPACING[4],
    gap: SPACING[2],
  },
  driveLoadingText: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
  },
  driveModalButtons: {
    gap: SPACING[2],
  },
  driveApproveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.md,
    shadowColor: COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  driveApproveBtnText: {
    color: COLORS.white,
    fontSize: FONT_SIZES.base,
    fontWeight: FONT_WEIGHTS.bold,
  },
  driveDeclineBtn: {
    paddingVertical: SPACING[2],
    alignItems: 'center',
  },
  driveDeclineBtnText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.medium,
  },
});

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  Switch,
  ActivityIndicator,
  Linking,
  Image,
  Platform,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { AppDataService } from '../../services/mockService';
import { COLORS, FONT_SIZES, FONT_WEIGHTS, RADIUS, SPACING } from '../../constants/theme';
import { getInitials, formatDateTime } from '../../utils/formatters';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { SUPPORTED_LANGUAGES, setAppLanguage, SupportedLanguageCode } from '../../i18n';
import { useAppTheme } from '../../context/ThemeContext';
import { getDatabase } from '../../database/db';
import { AuthService, AuthUser } from '../../services/authService';
import {
  BackupService,
  BackupSnapshot,
  RestoreStage,
  RestoreProgressEvent,
  RestoreResult,
  RestoreDiff,
  UploadStage,
  UploadProgressEvent,
} from '../../services/backupService';
import { GoogleDriveBackupService, DriveBackupMeta } from '../../services/googleDriveService';
import { BackupQueueService, BackupStatusInfo } from '../../services/backupQueueService';
import { DailyBackupService } from '../../services/dailyBackupService';
import { SyncService } from '../../services/syncService';
import { PrivacyPolicyModal } from '../../components/common/PrivacyPolicyModal';
import { ContactsService } from '../../services/contactsService';

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconBg: string;
  iconColor: string;
  title: string;
  subtitle: string;
  badge?: string;
  badgeVariant?: 'warning' | 'info' | 'success' | 'neutral';
  onPress: () => void;
  showArrow?: boolean;
  rightElement?: React.ReactNode;
  loading?: boolean;
  disabled?: boolean;
  colors?: any;
}

function SettingRow({
  icon,
  iconBg,
  iconColor,
  title,
  subtitle,
  badge,
  badgeVariant = 'neutral',
  onPress,
  showArrow = true,
  rightElement,
  loading = false,
  disabled = false,
  colors,
}: SettingRowProps) {
  const textTitleColor = colors?.textPrimary || COLORS.textPrimary;
  const textSubColor = colors?.textSecondary || COLORS.textSecondary;
  const arrowColor = colors?.textMuted || COLORS.textMuted;
  const borderColor = colors?.borderLight || COLORS.borderLight;

  return (
    <TouchableOpacity
      style={[
        styles.settingRow,
        { borderBottomColor: borderColor },
        (disabled || loading) && { opacity: 0.7 },
      ]}
      onPress={onPress}
      activeOpacity={0.65}
      delayPressIn={0}
      disabled={disabled || loading}
    >
      <View style={[styles.settingIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <View style={styles.settingTitleRow}>
          <Text style={[styles.settingTitle, { color: textTitleColor }]}>{title}</Text>
          {badge && <Badge label={badge} variant={badgeVariant} style={styles.rowBadge} />}
        </View>
        <Text style={[styles.settingSubtitle, { color: textSubColor }]}>{subtitle}</Text>
      </View>
      {loading ? (
        <ActivityIndicator size="small" color={colors?.primary || '#16a34a'} />
      ) : rightElement ? (
        rightElement
      ) : showArrow ? (
        <Ionicons name="chevron-forward" size={16} color={arrowColor} />
      ) : null}
    </TouchableOpacity>
  );
}

const REMINDER_ENABLED_KEY = 'user_reminders_enabled';
const REMINDER_FREQ_KEY = 'user_reminders_freq';
const REMINDER_TONE_KEY = 'user_reminders_tone';

export function SettingsScreen({ onLogout }: { onLogout?: () => void }) {
  const { t, i18n } = useTranslation();
  const { isDark, colors, toggleTheme } = useAppTheme();
  const mockUser = AppDataService.getUser();
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [avatarError, setAvatarError] = useState(false);
  const [dbStatus] = useState('Encrypted & Active');
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [privacyModalVisible, setPrivacyModalVisible] = useState(false);

  // Edit custom profile display name state
  const [editNameModalVisible, setEditNameModalVisible] = useState(false);
  const [customNameInput, setCustomNameInput] = useState('');
  const [savingCustomName, setSavingCustomName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
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

  // Reminders configuration modal state
  const [remindersModalVisible, setRemindersModalVisible] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderFreq, setReminderFreq] = useState<'daily' | 'weekly'>('daily');
  const [reminderTone, setReminderTone] = useState<'gentle' | 'standard' | 'urgent'>('standard');

  // Google Drive state
  const [isDriveConnected, setIsDriveConnected] = useState(false);
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [localBackupLoading, setLocalBackupLoading] = useState(false);
  const [localRestoreLoading, setLocalRestoreLoading] = useState(false);
  const [contactsAllowed, setContactsAllowed] = useState(false);

  // ── Upload Confirmation & Live Progress Modal State ───────────────────────
  const [uploadConfirmVisible, setUploadConfirmVisible] = useState(false);
  const [uploadSnapshotSummary, setUploadSnapshotSummary] = useState<{
    customersCount: number;
    duesCount: number;
    paymentsCount: number;
    timestamp: string;
  } | null>(null);
  const [fetchingUploadSummary, setFetchingUploadSummary] = useState(false);

  const [uploadInProgress, setUploadInProgress] = useState(false);
  const [uploadProgressModalVisible, setUploadProgressModalVisible] = useState(false);
  const [uploadStage, setUploadStage] = useState<UploadStage>('PREPARING');
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number>(0);
  const [uploadStageLabel, setUploadStageLabel] = useState<string>('');
  const [uploadProgressDetails, setUploadProgressDetails] = useState<string>('');
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    customersCount: number;
    duesCount: number;
    paymentsCount: number;
    timestamp: string;
    pdfUri?: string;
    isUpdated?: boolean;
    message?: string;
  } | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // ── Restore Confirmation & Live Progress Modal State ──────────────────────
  const [selectedBackupFile, setSelectedBackupFile] = useState<DriveBackupMeta | null>(null);
  const [selectedSnapshot, setSelectedSnapshot] = useState<BackupSnapshot | null>(null);
  const [restoreDiff, setRestoreDiff] = useState<RestoreDiff | null>(null);
  const [fetchingSnapshot, setFetchingSnapshot] = useState(false);
  const [confirmModalVisible, setConfirmModalVisible] = useState(false);

  const [restoreInProgress, setRestoreInProgress] = useState(false);
  const [progressModalVisible, setProgressModalVisible] = useState(false);
  const [restoreStage, setRestoreStage] = useState<RestoreStage>('DOWNLOADING');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [progressStageLabel, setProgressStageLabel] = useState<string>('');
  const [progressDetails, setProgressDetails] = useState<string>('');
  const [restoreResult, setRestoreResult] = useState<RestoreResult | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const [backupStatus, setBackupStatus] = useState<BackupStatusInfo | null>(null);

  // Cloud Backup Details Modal & Backup and Recovery Modal
  const [cloudDetailsModalVisible, setCloudDetailsModalVisible] = useState(false);
  const [recoveryModalVisible, setRecoveryModalVisible] = useState(false);
  const [savedLocalBackup, setSavedLocalBackup] = useState<BackupSnapshot | null>(null);

  const loadLocalBackupMeta = async () => {
    try {
      const snap = await BackupService.getLocalBackup();
      setSavedLocalBackup(snap);
    } catch (e) {
      console.warn('[SettingsScreen] loadLocalBackupMeta error:', e);
    }
  };

  useEffect(() => {
    loadLocalBackupMeta();
    (async () => {
      try {
        let u = await AuthService.getUser();
        if (u) {
          setAuthUser(u);
        }

        // Check if Google Sign-In has current active user info with a photo
        try {
          const RNSignIn = require('@react-native-google-signin/google-signin');
          if (RNSignIn?.GoogleSignin) {
            const currentUser = await RNSignIn.GoogleSignin.getCurrentUser();
            const googleUser = currentUser?.data?.user || currentUser?.user;
            const photo = googleUser?.photo || googleUser?.picture;
            if (photo && (!u || !u.avatarUrl)) {
              const updated: AuthUser = {
                ...(u || { id: googleUser.id, name: googleUser.name || 'Google User', email: googleUser.email || '' }),
                avatarUrl: photo,
                picture: photo,
              };
              await AuthService.setUser(updated);
              setAuthUser(updated);
            }
          }
        } catch {
          // Ignored in non-native / test environments
        }
      } catch (err) {
        console.warn('[SettingsScreen] Error loading auth profile:', err);
      }
    })();

    // Subscribe to live backup status & Drive authorization
    const unsubscribeBackup = BackupQueueService.subscribe((status) => {
      setBackupStatus(status);
      setIsDriveConnected(status.isDriveConnected);
    });

    // Load saved reminder preferences from SQLite
    (async () => {
      try {
        const db = await getDatabase();
        const enabledRow = await db.getFirstAsync<{ value: string }>(
          'SELECT value FROM app_settings WHERE key = ?;',
          [REMINDER_ENABLED_KEY]
        );
        if (enabledRow) {
          setRemindersEnabled(enabledRow.value === '1' || enabledRow.value === 'true');
        }

        const freqRow = await db.getFirstAsync<{ value: string }>(
          'SELECT value FROM app_settings WHERE key = ?;',
          [REMINDER_FREQ_KEY]
        );
        if (freqRow && (freqRow.value === 'daily' || freqRow.value === 'weekly')) {
          setReminderFreq(freqRow.value as any);
        }

        const toneRow = await db.getFirstAsync<{ value: string }>(
          'SELECT value FROM app_settings WHERE key = ?;',
          [REMINDER_TONE_KEY]
        );
        if (
          toneRow &&
          (toneRow.value === 'gentle' || toneRow.value === 'standard' || toneRow.value === 'urgent')
        ) {
          setReminderTone(toneRow.value as any);
        }
      } catch (e) {
        console.warn('[SettingsScreen] Could not load reminder settings:', e);
      }
    })();

    // Check Contacts permission status
    ContactsService.checkPermission().then((status) => {
      setContactsAllowed(status === 'granted');
    }).catch(() => {});

    return () => {
      unsubscribeBackup();
    };
  }, []);

  const handleContactsRowPress = async () => {
    if (contactsAllowed) {
      Alert.alert(
        t('contacts.connectTitle', 'Phone Contacts'),
        t('contacts.accessDesc', 'Contacts are accessed locally to help you quickly find and add customers without manual typing.'),
        [
          { text: t('common.ok', 'OK') },
          {
            text: t('contacts.openSettings', 'Open Settings'),
            onPress: () => {
              if (Platform.OS === 'android' || Platform.OS === 'ios') {
                Linking.openSettings().catch(() => {});
              }
            },
          },
        ]
      );
    } else {
      const status = await ContactsService.requestPermission();
      if (status === 'granted') {
        setContactsAllowed(true);
        Alert.alert(t('common.success', 'Success'), t('contacts.accessEnabled', 'Contacts access enabled.'));
      } else {
        Alert.alert(
          t('contacts.permissionDeniedTitle', 'Permission Required'),
          t('contacts.permissionDeniedMsg', 'Contacts access is disabled. Please enable it in Settings.'),
          [
            { text: t('common.cancel', 'Cancel'), style: 'cancel' },
            {
              text: t('contacts.openSettings', 'Open Settings'),
              onPress: () => {
                if (Platform.OS === 'android' || Platform.OS === 'ios') {
                  Linking.openSettings().catch(() => {});
                }
              },
            },
          ]
        );
      }
    }
  };

  const saveReminderSettings = async (
    enabled: boolean,
    freq: 'daily' | 'weekly',
    tone: 'gentle' | 'standard' | 'urgent'
  ) => {
    try {
      const db = await getDatabase();
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [REMINDER_ENABLED_KEY, enabled ? '1' : '0', now]
      );
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [REMINDER_FREQ_KEY, freq, now]
      );
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [REMINDER_TONE_KEY, tone, now]
      );
    } catch (e) {
      console.warn('[SettingsScreen] Failed to save reminder settings:', e);
    }
  };

  const displayName = authUser?.customName || authUser?.name || mockUser.name;
  const displayEmail = authUser?.email || mockUser.email;
  const avatarUrl = authUser?.avatarUrl || authUser?.picture || (authUser as any)?.photoUrl || (authUser as any)?.photo;

  const handleOpenEditNameModal = () => {
    setCustomNameInput(displayName);
    setNameError(null);
    setEditNameModalVisible(true);
  };

  const handleCloseEditNameModal = () => {
    if (isKeyboardVisible) {
      Keyboard.dismiss();
      return;
    }
    setEditNameModalVisible(false);
  };

  const handleCancelEditName = () => {
    Keyboard.dismiss();
    setEditNameModalVisible(false);
  };

  const handleSaveCustomName = async () => {
    const trimmed = customNameInput.trim();
    if (!trimmed) {
      setNameError(t('settings.nameRequired', 'Display name cannot be empty'));
      return;
    }
    if (trimmed.length > 40) {
      setNameError(t('settings.nameTooLong', 'Display name must not exceed 40 characters'));
      return;
    }
    setSavingCustomName(true);
    setNameError(null);
    try {
      await AuthService.setCustomName(trimmed);
      const updated = await AuthService.getUser();
      if (updated) {
        setAuthUser(updated);
      }
      Keyboard.dismiss();
      setEditNameModalVisible(false);
    } catch (e) {
      console.warn('[SettingsScreen] Failed to save custom name:', e);
      Alert.alert(t('common.error'), 'Failed to save display name.');
    } finally {
      setSavingCustomName(false);
    }
  };

  const currentLangObj =
    SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language) || SUPPORTED_LANGUAGES[0];

  const handleSelectLanguage = async (code: SupportedLanguageCode) => {
    await setAppLanguage(code);
    setLangModalVisible(false);
  };

  const handleLogout = () => {
    Alert.alert(
      t('settings.logoutConfirmTitle'),
      t('settings.logoutConfirmMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.logoutTitle'),
          style: 'destructive',
          onPress: async () => {
            await AuthService.logout();
            if (onLogout) {
              onLogout();
            }
          },
        },
      ]
    );
  };

  const handleConnectDrive = async () => {
    if (!GoogleDriveBackupService.isDriveAvailable()) {
      Alert.alert(
        'Cloud Backup Notice',
        'Google Drive authorization is unavailable in this environment. Local backup and restore remains 100% functional on your device.'
      );
      return;
    }

    if (isDriveConnected) {
      Alert.alert(
        t('settings.disconnectDriveTitle'),
        'Are you sure you want to unlink Google Drive authorization on this device?',
        [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: async () => {
              await GoogleDriveBackupService.disconnectGoogleDrive();
              setIsDriveConnected(false);
              Alert.alert('Google Drive', 'Google Drive disconnected on this device.');
            },
          },
        ]
      );
      return;
    }

    setLoadingDrive(true);
    const res = await GoogleDriveBackupService.connectGoogleDrive();
    setLoadingDrive(false);
    if (res.success) {
      setIsDriveConnected(true);
      Alert.alert('✅ Google Drive', res.message);
      BackupQueueService.resumePendingWork();
    } else {
      Alert.alert('Google Drive Authorization', res.message);
    }
  };

  const handleLocalBackup = async () => {
    setLocalBackupLoading(true);
    try {
      const snapshot = await BackupService.createLocalSnapshot();
      await BackupService.saveLocalBackup(snapshot);
      await loadLocalBackupMeta();
      Alert.alert(
        '✅ Local Backup Saved',
        `Your business ledger has been safely saved on this device.\n\nSummary:\n• ${snapshot.customersCount} Customers\n• ${snapshot.duesCount} Dues\n• ${snapshot.paymentsCount} Payments\n\nDate: ${formatDateTime(snapshot.createdAt, i18n.language)}`,
        [{ text: t('common.ok') }]
      );
    } catch (e: any) {
      Alert.alert('Backup Error', e.message || 'Failed to create local backup.');
    } finally {
      setLocalBackupLoading(false);
    }
  };

  const handleLocalRestore = async () => {
    const snapshot = savedLocalBackup || (await BackupService.getLocalBackup());
    if (!snapshot) {
      Alert.alert(
        'Restore Local Backup',
        'No usable local backup was found on this device. You can create one anytime by tapping "Create Local Backup".'
      );
      return;
    }

    Alert.alert(
      'Restore Local Data',
      `Available Ledger Records:\n• ${snapshot.customersCount} Customers\n• ${snapshot.duesCount} Dues\n• ${snapshot.paymentsCount} Payments\nDate: ${formatDateTime(snapshot.createdAt, i18n.language)}\n\nA safety recovery backup will be created before restoring.\nProceed to restore?`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: 'Restore Now',
          style: 'destructive',
          onPress: async () => {
            setLocalRestoreLoading(true);
            try {
              try {
                await BackupService.createSafetyRecoveryBackup();
              } catch (safetyErr) {
                console.warn('[SettingsScreen] Pre-restore local safety backup notice:', safetyErr);
              }
              const res = await BackupService.restoreSnapshot(snapshot);
              Alert.alert('✅ Restore Complete', res.message);
              SyncService.syncExistingLocalRecords().catch(() => {});
            } catch (e: any) {
              Alert.alert('Restore Error', e.message || 'Failed to restore local backup.');
            } finally {
              setLocalRestoreLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleExportLedgerPdf = async () => {
    try {
      const snapshot = await BackupService.createLocalSnapshot();
      const { PdfReportService } = require('../../services/pdfReportService');
      const pdf = await PdfReportService.generateReportPdf(snapshot);
      await PdfReportService.shareOrViewPdf(pdf.uri);
    } catch (e: any) {
      Alert.alert(
        'Export Ledger',
        e?.message || 'Unable to generate or share ledger PDF report on this device.'
      );
    }
  };

  /**
   * 1. Google Drive Cloud Backup Confirmation
   */
  const handleDriveBackup = async () => {
    const isDriveAvail = GoogleDriveBackupService.isDriveAvailable();
    if (!isDriveAvail) {
      Alert.alert(
        'Cloud Backup Notice',
        'Direct Google Drive cloud backup is unavailable in this environment.\n\nLocal Backup & Restore is active and 100% functional on your device.',
        [{ text: t('common.gotIt') }]
      );
      return;
    }

    if (uploadInProgress) return;

    setFetchingUploadSummary(true);
    setUploadConfirmVisible(true);

    try {
      const snapshot = await BackupService.createLocalSnapshot();
      setUploadSnapshotSummary({
        customersCount: snapshot.customersCount,
        duesCount: snapshot.duesCount,
        paymentsCount: snapshot.paymentsCount,
        timestamp: snapshot.createdAt,
      });
    } catch (e: any) {
      console.warn('[SettingsScreen] Failed to inspect local backup counts:', e);
      setUploadSnapshotSummary({
        customersCount: 0,
        duesCount: 0,
        paymentsCount: 0,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setFetchingUploadSummary(false);
    }
  };

  /**
   * 2. Start Real Progress Upload Execution
   */
  const handleConfirmExecuteUpload = async () => {
    if (uploadInProgress) return;

    setUploadConfirmVisible(false);
    setUploadInProgress(true);
    setUploadProgressModalVisible(true);
    setUploadStage('PREPARING');
    setUploadProgressPercent(15);
    setUploadStageLabel(t('settings.uploadStagePreparing'));
    setUploadProgressDetails('');
    setUploadResult(null);
    setUploadError(null);

    const onProgress = (event: UploadProgressEvent) => {
      setUploadStage(event.stage);
      setUploadProgressPercent(event.progressPercent);

      let label = event.stageLabel;
      if (event.stage === 'PREPARING') label = t('settings.uploadStagePreparing');
      else if (event.stage === 'CREATING') label = t('settings.uploadStageCreating');
      else if (event.stage === 'SECURING') label = t('settings.uploadStageSecuring');
      else if (event.stage === 'UPLOADING') label = t('settings.uploadStageUploading');
      else if (event.stage === 'FINALIZING') label = t('settings.uploadStageFinalizing');
      else if (event.stage === 'COMPLETED') label = t('settings.uploadSuccessTitle');
      else if (event.stage === 'FAILED') label = t('settings.uploadErrorTitle');

      setUploadStageLabel(label);
      if (event.details) setUploadProgressDetails(event.details);
    };

    try {
      const res = await GoogleDriveBackupService.uploadBackupToDrive(onProgress);

      if (res.success) {
        setIsDriveConnected(true);
        setUploadStage('COMPLETED');
        setUploadProgressPercent(100);
        setUploadStageLabel(t('settings.uploadSuccessTitle'));
        setUploadResult({
          success: true,
          customersCount: res.snapshot?.customersCount ?? (uploadSnapshotSummary?.customersCount || 0),
          duesCount: res.snapshot?.duesCount ?? (uploadSnapshotSummary?.duesCount || 0),
          paymentsCount: res.snapshot?.paymentsCount ?? (uploadSnapshotSummary?.paymentsCount || 0),
          timestamp: res.snapshot?.createdAt ?? (uploadSnapshotSummary?.timestamp || new Date().toISOString()),
          pdfUri: res.pdfUri,
          isUpdated: res.isUpdated,
          message: res.message,
        });
        await BackupQueueService.setPendingWorkFlag(false);
        await BackupQueueService.setLastBackupTime(res.snapshot?.createdAt ?? new Date().toISOString());
      } else {
        setUploadStage('FAILED');
        setUploadError(res.message || 'Drive backup failed');
      }
    } catch (err: any) {
      setUploadStage('FAILED');
      setUploadError(err?.message || 'Unexpected upload error occurred.');
    } finally {
      setUploadInProgress(false);
    }
  };

  const handleOpenDriveRestore = async () => {
    if (!GoogleDriveBackupService.isDriveAvailable()) {
      Alert.alert(
        'Cloud Restore Notice',
        'Google Drive restore is unavailable in this environment.'
      );
      return;
    }

    // Instant UI feedback: open modal immediately with loading indicator
    setLoadingDrive(true);
    setSelectedBackupFile(null);
    setSelectedSnapshot(null);
    setFetchingSnapshot(true);
    setConfirmModalVisible(true);

    try {
      const res = await GoogleDriveBackupService.listBackupsFromDrive();

      if (!res.success) {
        setConfirmModalVisible(false);
        setLoadingDrive(false);
        setFetchingSnapshot(false);
        Alert.alert('Google Drive', res.message || 'Could not retrieve cloud backup.');
        return;
      }

      // Filter valid json backup files
      const jsonBackups = (res.backups || []).filter((f) => f.name.endsWith('.json'));

      if (jsonBackups.length === 0) {
        setConfirmModalVisible(false);
        setLoadingDrive(false);
        setFetchingSnapshot(false);
        Alert.alert(
          'Google Drive',
          'No cloud backup found in your Hisab Money Google Drive folder.'
        );
        return;
      }

      // Pick the best backup file automatically (WhatsApp-style)
      // Inspect candidate backups and prioritize the one containing customer records
      let chosenFile = jsonBackups[0];
      let chosenSnapshot: BackupSnapshot | null = null;

      for (const candidate of jsonBackups) {
        const check = await GoogleDriveBackupService.fetchBackupContent(candidate.id);
        if (check.success && check.snapshot) {
          if (!chosenSnapshot || check.snapshot.customersCount > (chosenSnapshot.customersCount || 0)) {
            chosenFile = candidate;
            chosenSnapshot = check.snapshot;
            if (check.snapshot.customersCount > 0) {
              // Found a backup with customer data
              break;
            }
          }
        }
      }

      setSelectedBackupFile(chosenFile);
      setLoadingDrive(false);
      setFetchingSnapshot(false);

      if (chosenSnapshot) {
        setSelectedSnapshot(chosenSnapshot);
        try {
          const diff = await BackupService.calculateRestoreDiff(chosenSnapshot);
          setRestoreDiff(diff);
        } catch (diffErr) {
          console.warn('[SettingsScreen] Calculate restore diff notice:', diffErr);
        }
      } else {
        Alert.alert('Cloud Backup Notice', 'Could not inspect backup details.');
      }
    } catch (err: any) {
      setConfirmModalVisible(false);
      setLoadingDrive(false);
      setFetchingSnapshot(false);
      Alert.alert('Google Drive', err?.message || 'Error communicating with Google Drive.');
    }
  };

  /**
   * 2. Start Real Progress Restore Execution
   */
  const handleConfirmExecuteRestore = async () => {
    if (!selectedBackupFile || restoreInProgress) return;

    setConfirmModalVisible(false);
    setRestoreInProgress(true);
    setProgressModalVisible(true);
    setRestoreStage('DOWNLOADING');
    setProgressPercent(10);
    setProgressStageLabel(t('settings.stageDownloading'));
    setProgressDetails('');
    setRestoreResult(null);
    setRestoreError(null);

    const onProgress = (event: RestoreProgressEvent) => {
      setRestoreStage(event.stage);
      setProgressPercent(event.progressPercent);

      let label = event.stageLabel;
      if (event.stage === 'DOWNLOADING') label = t('settings.stageDownloading');
      else if (event.stage === 'VALIDATING') label = t('settings.stageValidating');
      else if (event.stage === 'RESTORING_CUSTOMERS') label = t('settings.stageRestoringCustomers');
      else if (event.stage === 'RESTORING_TRANSACTIONS') label = t('settings.stageRestoringTransactions');
      else if (event.stage === 'FINALIZING') label = t('settings.stageFinalizing');
      else if (event.stage === 'COMPLETED') label = t('settings.restoreSuccessTitle');
      else if (event.stage === 'FAILED') label = t('settings.restoreErrorTitle');

      setProgressStageLabel(label);
      if (event.details) setProgressDetails(event.details);
    };

    try {
      // Create safe recovery snapshot before modifying local records
      try {
        await BackupService.createSafetyRecoveryBackup();
      } catch (safetyErr) {
        console.warn('[SettingsScreen] Pre-restore safety backup notice:', safetyErr);
      }

      const res = await GoogleDriveBackupService.restoreBackupFromDrive(
        selectedBackupFile.id,
        onProgress
      );

      if (res.success && res.result) {
        setRestoreResult(res.result);
        setRestoreStage('COMPLETED');
        setProgressPercent(100);
        setProgressStageLabel(t('settings.restoreSuccessTitle'));

        // Refresh local backup metadata display
        loadLocalBackupMeta().catch(() => {});

        // Refresh background sync worker with newly restored records
        SyncService.syncExistingLocalRecords().catch(() => {});
      } else {
        setRestoreStage('FAILED');
        setRestoreError(res.message || 'Drive restore failed');
      }
    } catch (err: any) {
      setRestoreStage('FAILED');
      setRestoreError(err?.message || 'Unexpected restore error occurred.');
    } finally {
      setRestoreInProgress(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]} edges={['top']}>
      {/* Header */}
      <View
        style={[
          styles.header,
          { backgroundColor: colors.white, borderBottomColor: colors.borderLight },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>{t('settings.title')}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Google Profile Card */}
        <View style={[styles.profileCard, { backgroundColor: colors.white }]}>
          <View style={[styles.profileAvatar, { backgroundColor: isDark ? '#334155' : COLORS.primary }]}>
            {avatarUrl && !avatarError ? (
              <Image
                source={{ uri: avatarUrl }}
                style={styles.profileAvatarImage}
                onError={() => setAvatarError(true)}
                accessibilityRole="image"
                accessibilityLabel={displayName}
              />
            ) : (
              <Text style={styles.profileAvatarText}>{getInitials(displayName)}</Text>
            )}
          </View>
          <View style={styles.profileInfo}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <TouchableOpacity
                onPress={handleOpenEditNameModal}
                activeOpacity={0.7}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '78%' }}
                accessibilityLabel={t('settings.editProfileName', 'Edit Profile Name')}
              >
                <Text style={[styles.profileName, { color: colors.textPrimary }]} numberOfLines={1}>
                  {displayName}
                </Text>
                <View
                  style={[
                    styles.editPencilBadge,
                    {
                      backgroundColor: isDark ? '#1e293b' : '#ecfdf5',
                      borderColor: isDark ? '#334155' : '#a7f3d0',
                    },
                  ]}
                >
                  <Ionicons name="pencil" size={12} color={colors.primary} />
                </View>
              </TouchableOpacity>
              {authUser && <Badge label="Google" variant="success" dot />}
            </View>
            {displayEmail ? (
              <Text style={[styles.profileContact, { color: colors.textSecondary }]} numberOfLines={1}>
                {displayEmail}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Database Status Card */}
        <View
          style={[
            styles.dbStatusCard,
            {
              backgroundColor: isDark ? '#064e3b' : '#f0fdf4',
              borderColor: isDark ? '#059669' : '#bbf7d0',
            },
          ]}
        >
          <View style={[styles.dbStatusIcon, { backgroundColor: isDark ? '#022c22' : '#dcfce7' }]}>
            <Ionicons name="shield-checkmark" size={20} color={isDark ? '#4ade80' : '#16a34a'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.dbStatusTitle, { color: isDark ? '#4ade80' : '#15803d' }]}>
              {t('settings.sqliteTitle')}
            </Text>
            <Text style={[styles.dbStatusSubtitle, { color: isDark ? '#a7f3d0' : '#166534' }]}>
              {dbStatus}
            </Text>
          </View>
          <Badge label={t('settings.activeBadge')} variant="success" dot />
        </View>

        {/* App Settings Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
            {t('settings.appSettingsSection')}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            {/* Language Setting Row */}
            <SettingRow
              icon="language-outline"
              iconBg={isDark ? '#082f49' : '#e0f2fe'}
              iconColor="#0284c7"
              title={t('settings.languageTitle')}
              subtitle={`${currentLangObj.flag} ${currentLangObj.nativeName} (${currentLangObj.label})`}
              badge={currentLangObj.nativeName}
              badgeVariant="info"
              colors={colors}
              onPress={() => setLangModalVisible(true)}
            />
            {/* Dark Mode Toggle Row */}
            <SettingRow
              icon={isDark ? 'moon' : 'sunny'}
              iconBg={isDark ? '#334155' : '#f3f4f6'}
              iconColor={isDark ? '#fbbf24' : '#374151'}
              title={t('settings.darkModeTitle')}
              subtitle={isDark ? t('settings.darkModeActive') : t('settings.lightModeActive')}
              colors={colors}
              onPress={toggleTheme}
              showArrow={false}
              rightElement={
                <Switch
                  value={isDark}
                  onValueChange={toggleTheme}
                  trackColor={{ false: '#cbd5e1', true: '#86efac' }}
                  thumbColor={isDark ? '#16a34a' : '#f8fafc'}
                />
              }
            />
            {/* Currency Row */}
            <SettingRow
              icon="cash-outline"
              iconBg={isDark ? '#064e3b' : '#dcfce7'}
              iconColor="#16a34a"
              title={t('settings.currencyTitle')}
              subtitle={t('settings.currencySubtitle')}
              colors={colors}
              onPress={() => {}}
              showArrow={false}
            />
            {/* Payment Reminders Row */}
            <SettingRow
              icon="notifications-outline"
              iconBg={isDark ? '#451a03' : '#fef3c7'}
              iconColor="#d97706"
              title={t('settings.paymentRemindersTitle')}
              subtitle={
                remindersEnabled
                  ? `${t('settings.remindersEnabled')} (${reminderFreq})`
                  : 'Disabled'
              }
              badge={remindersEnabled ? 'Active' : 'Off'}
              badgeVariant={remindersEnabled ? 'success' : 'neutral'}
              colors={colors}
              onPress={() => setRemindersModalVisible(true)}
            />
            {/* Phone Contacts Row */}
            <SettingRow
              icon="people-outline"
              iconBg={isDark ? '#064e3b' : '#dcfce7'}
              iconColor="#16a34a"
              title={t('contacts.connectTitle', 'Phone Contacts')}
              subtitle={
                contactsAllowed
                  ? t('contacts.accessEnabled', 'Contacts Access Enabled')
                  : t('contacts.accessDisabled', 'Contacts Access Disabled')
              }
              badge={contactsAllowed ? 'Active' : 'Off'}
              badgeVariant={contactsAllowed ? 'success' : 'neutral'}
              colors={colors}
              onPress={handleContactsRowPress}
            />
          </View>
        </View>

        {/* Compact Cloud Backup Card (Section 7) */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
            CLOUD BACKUP
          </Text>
          <TouchableOpacity
            style={[
              styles.cloudBackupCard,
              {
                backgroundColor: colors.white,
                borderColor: isDriveConnected
                  ? isDark ? '#065f46' : '#a7f3d0'
                  : colors.borderLight,
              },
            ]}
            activeOpacity={0.75}
            onPress={() => setCloudDetailsModalVisible(true)}
          >
            <View style={styles.cloudBackupHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View
                  style={[
                    styles.cloudBackupIcon,
                    {
                      backgroundColor: isDriveConnected
                        ? isDark ? '#064e3b' : '#dcfce7'
                        : isDark ? '#450a0a' : '#fee2e2',
                    },
                  ]}
                >
                  <Ionicons
                    name="cloud-outline"
                    size={22}
                    color={isDriveConnected ? '#16a34a' : '#dc2626'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={[styles.cloudBackupTitle, { color: colors.textPrimary }]}>
                      Cloud Backup
                    </Text>
                    <Badge label="Always ON" variant="success" dot />
                  </View>
                  <Text style={[styles.cloudBackupSubtitle, { color: colors.textSecondary }]}>
                    {isDriveConnected
                      ? 'Google Drive Connected'
                      : 'Google Drive Not Connected'}
                  </Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>

            <View
              style={[
                styles.cloudBackupStatusRow,
                {
                  backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                  borderColor: colors.borderLight,
                },
              ]}
            >
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={[styles.cloudStatusLabel, { color: colors.textMuted }]}>
                  Status
                </Text>
                <Text
                  style={[
                    styles.cloudStatusValue,
                    {
                      color:
                        backupStatus?.state === 'FAILED'
                          ? '#dc2626'
                          : backupStatus?.state === 'PENDING'
                            ? '#d97706'
                            : backupStatus?.state === 'BACKING_UP'
                              ? '#0284c7'
                              : '#16a34a',
                    },
                  ]}
                >
                  {backupStatus?.state === 'BACKING_UP'
                    ? 'Backing up...'
                    : backupStatus?.state === 'FAILED'
                      ? 'Backup failed'
                      : backupStatus?.state === 'PENDING'
                        ? !isDriveConnected ? 'Pending (Connect Drive)' : 'Pending (Saving...)'
                        : 'Up to date'}
                </Text>
              </View>

              <View style={{ flex: 1.2 }}>
                <Text style={[styles.cloudStatusLabel, { color: colors.textMuted }]}>
                  Last Backup
                </Text>
                <Text style={[styles.cloudStatusValue, { color: colors.textPrimary }]} numberOfLines={1}>
                  {backupStatus?.lastBackupTime
                    ? `${new Date(backupStatus.lastBackupTime).toLocaleDateString()} ${new Date(backupStatus.lastBackupTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                    : 'None yet'}
                </Text>
              </View>
            </View>

            {!isDriveConnected && (
              <TouchableOpacity
                style={styles.connectDriveButton}
                onPress={handleConnectDrive}
                disabled={loadingDrive}
                activeOpacity={0.8}
              >
                {loadingDrive ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={16} color="#ffffff" />
                    <Text style={styles.connectDriveButtonText}>Connect Google Drive</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>

        {/* Data & Storage Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
            {t('settings.dataBackupSection')}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            {/* Backup & Recovery Row (Section 8) */}
            <SettingRow
              icon="shield-checkmark-outline"
              iconBg={isDark ? '#1e1b4b' : '#ede9fe'}
              iconColor="#7c3aed"
              title="Backup & Recovery"
              subtitle="Restore from Google Drive or manage local backups"
              colors={colors}
              onPress={() => {
                loadLocalBackupMeta();
                setRecoveryModalVisible(true);
              }}
            />

            {/* Export Ledger (PDF) */}
            <SettingRow
              icon="download-outline"
              iconBg={isDark ? '#1e293b' : '#f3f4f6'}
              iconColor={isDark ? '#94a3b8' : '#4b5563'}
              title={t('settings.exportTitle')}
              subtitle={t('settings.exportSubtitle')}
              colors={colors}
              onPress={handleExportLedgerPdf}
            />
          </View>
        </View>

        {/* About */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
            {t('settings.aboutSection')}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            <SettingRow
              icon="information-circle-outline"
              iconBg={isDark ? '#1e293b' : '#f1f5f9'}
              iconColor={isDark ? '#94a3b8' : '#475569'}
              title={t('settings.appVersionTitle')}
              subtitle={t('settings.appVersionSubtitle')}
              colors={colors}
              onPress={() => {}}
              showArrow={false}
            />
            <SettingRow
              icon="mail-outline"
              iconBg={isDark ? '#1e3a8a' : '#eff6ff'}
              iconColor="#2563eb"
              title={t('settings.supportTitle')}
              subtitle="support.hisabmoney@gmail.com"
              colors={colors}
              onPress={() => Linking.openURL('mailto:support.hisabmoney@gmail.com')}
            />
            <SettingRow
              icon="shield-checkmark-outline"
              iconBg={isDark ? '#064e3b' : '#f0fdf4'}
              iconColor="#16a34a"
              title={t('settings.privacyTitle')}
              subtitle={t('settings.privacySubtitle')}
              colors={colors}
              onPress={() => setPrivacyModalVisible(true)}
            />
          </View>
        </View>

        {/* Account & Security Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>
            {t('settings.accountSection')}
          </Text>
          <View style={[styles.card, { backgroundColor: colors.white }]}>
            <SettingRow
              icon="log-out-outline"
              iconBg={isDark ? '#450a0a' : '#fee2e2'}
              iconColor="#dc2626"
              title={t('settings.logoutTitle')}
              subtitle={t('settings.logoutSubtitle')}
              colors={colors}
              onPress={handleLogout}
              showArrow={false}
            />
          </View>
        </View>

        <View style={{ height: SPACING[8] }} />
      </ScrollView>

      {/* Language Selection Modal */}
      <Modal
        visible={langModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setLangModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setLangModalVisible(false)}
        >
          <View
            style={[styles.modalSheet, { backgroundColor: colors.white }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHandle} />
            <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {t('settings.selectLanguageModalTitle')}
              </Text>
              <TouchableOpacity
                onPress={() => setLangModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <View style={styles.langList}>
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isSelected = i18n.language === lang.code;
                return (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.langOption,
                      {
                        backgroundColor: isSelected
                          ? isDark
                            ? '#064e3b'
                            : '#f0fdf4'
                          : isDark
                            ? '#1e293b'
                            : '#f8fafc',
                        borderColor: isSelected ? '#86efac' : colors.borderLight,
                      },
                    ]}
                    onPress={() => handleSelectLanguage(lang.code)}
                    activeOpacity={0.7}
                    delayPressIn={0}
                  >
                    <View style={styles.langOptionLeft}>
                      <Text style={styles.langFlag}>{lang.flag}</Text>
                      <View>
                        <Text
                          style={[
                            styles.langNativeName,
                            { color: isSelected ? colors.primary : colors.textPrimary },
                          ]}
                        >
                          {lang.nativeName}
                        </Text>
                        <Text style={[styles.langSubName, { color: colors.textSecondary }]}>
                          {lang.label}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[styles.radioCircle, isSelected && { borderColor: colors.primary }]}
                    >
                      {isSelected && (
                        <View style={[styles.radioDot, { backgroundColor: colors.primary }]} />
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Payment Reminders Configuration Modal */}
      <Modal
        visible={remindersModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRemindersModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setRemindersModalVisible(false)}
        >
          <View
            style={[styles.modalSheet, { backgroundColor: colors.white }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHandle} />
            <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  {t('settings.remindersModalTitle')}
                </Text>
                <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textMuted }}>
                  Local Device SMS & Notification Reminders
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setRemindersModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            {/* Toggle Reminders Row */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingVertical: SPACING[3],
                borderBottomWidth: 1,
                borderBottomColor: colors.borderLight,
              }}
            >
              <View style={{ flex: 1, paddingRight: SPACING[3] }}>
                <Text
                  style={{
                    fontSize: FONT_SIZES.sm,
                    fontWeight: FONT_WEIGHTS.bold,
                    color: colors.textPrimary,
                  }}
                >
                  {t('settings.remindersEnabled')}
                </Text>
                <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textSecondary, marginTop: 2 }}>
                  {t('settings.remindersEnabledDesc')}
                </Text>
              </View>
              <Switch
                value={remindersEnabled}
                onValueChange={(val) => {
                  setRemindersEnabled(val);
                  saveReminderSettings(val, reminderFreq, reminderTone);
                }}
                trackColor={{ false: '#cbd5e1', true: colors.primary }}
              />
            </View>

            {/* Frequency Selection */}
            <View style={{ marginTop: SPACING[3] }}>
              <Text
                style={{
                  fontSize: FONT_SIZES.xs,
                  fontWeight: FONT_WEIGHTS.semibold,
                  color: colors.textMuted,
                  marginBottom: SPACING[2],
                }}
              >
                {t('settings.reminderScheduleTitle')}
              </Text>
              <View style={{ flexDirection: 'row', gap: SPACING[2] }}>
                {[
                  { id: 'daily', label: t('settings.reminderDaily') },
                  { id: 'weekly', label: t('settings.reminderWeekly') },
                ].map((item) => {
                  const active = reminderFreq === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={{
                        flex: 1,
                        paddingVertical: SPACING[2],
                        paddingHorizontal: SPACING[3],
                        borderRadius: RADIUS.md,
                        backgroundColor: active
                          ? isDark
                            ? '#064e3b'
                            : '#dcfce7'
                          : isDark
                            ? '#1e293b'
                            : '#f1f5f9',
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.borderLight,
                        alignItems: 'center',
                      }}
                      onPress={() => {
                        setReminderFreq(item.id as any);
                        saveReminderSettings(remindersEnabled, item.id as any, reminderTone);
                      }}
                      activeOpacity={0.7}
                      delayPressIn={0}
                    >
                      <Text
                        style={{
                          fontSize: FONT_SIZES.xs,
                          fontWeight: FONT_WEIGHTS.semibold,
                          color: active ? colors.primary : colors.textPrimary,
                        }}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Tone Selection */}
            <View style={{ marginTop: SPACING[4] }}>
              <Text
                style={{
                  fontSize: FONT_SIZES.xs,
                  fontWeight: FONT_WEIGHTS.semibold,
                  color: colors.textMuted,
                  marginBottom: SPACING[2],
                }}
              >
                {t('settings.reminderTemplateTitle')}
              </Text>
              <View style={{ flexDirection: 'row', gap: SPACING[2] }}>
                {[
                  { id: 'gentle', label: t('settings.toneGentle') },
                  { id: 'standard', label: t('settings.toneStandard') },
                  { id: 'urgent', label: t('settings.toneUrgent') },
                ].map((item) => {
                  const active = reminderTone === item.id;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={{
                        flex: 1,
                        paddingVertical: SPACING[2],
                        paddingHorizontal: SPACING[2],
                        borderRadius: RADIUS.md,
                        backgroundColor: active
                          ? isDark
                            ? '#064e3b'
                            : '#dcfce7'
                          : isDark
                            ? '#1e293b'
                            : '#f1f5f9',
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.borderLight,
                        alignItems: 'center',
                      }}
                      onPress={() => {
                        setReminderTone(item.id as any);
                        saveReminderSettings(remindersEnabled, reminderFreq, item.id as any);
                      }}
                      activeOpacity={0.7}
                      delayPressIn={0}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: FONT_WEIGHTS.semibold,
                          color: active ? colors.primary : colors.textPrimary,
                        }}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Close Button */}
            <TouchableOpacity
              style={{
                marginTop: SPACING[5],
                backgroundColor: colors.primary,
                paddingVertical: SPACING[3],
                borderRadius: RADIUS.lg,
                alignItems: 'center',
              }}
              onPress={() => setRemindersModalVisible(false)}
            >
              <Text
                style={{
                  color: '#ffffff',
                  fontWeight: FONT_WEIGHTS.bold,
                  fontSize: FONT_SIZES.sm,
                }}
              >
                {t('settings.saveSettings')}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 0A. CLOUD BACKUP DETAILS MODAL (Section 7) ─────────────────────── */}
      <Modal
        visible={cloudDetailsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCloudDetailsModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCloudDetailsModalVisible(false)}
        >
          <View
            style={[styles.modalSheet, { backgroundColor: colors.white }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHandle} />
            <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  Cloud Backup Details
                </Text>
                <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textMuted }}>
                  Always-On Google Cloud Synchronization
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCloudDetailsModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 460 }}>
              {/* Connected Account Section */}
              <View
                style={[
                  styles.detailsCard,
                  {
                    backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                    borderColor: colors.borderLight,
                    marginVertical: SPACING[2],
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 20,
                      backgroundColor: colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                      overflow: 'hidden',
                    }}
                  >
                    {avatarUrl && !avatarError ? (
                      <Image
                        source={{ uri: avatarUrl }}
                        style={{ width: 40, height: 40, borderRadius: 20 }}
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      <Text style={{ color: '#ffffff', fontWeight: FONT_WEIGHTS.bold }}>
                        {getInitials(displayName)}
                      </Text>
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary }}>
                      {displayName}
                    </Text>
                    {displayEmail ? (
                      <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textSecondary }}>
                        {displayEmail}
                      </Text>
                    ) : null}
                  </View>
                  <Badge
                    label={isDriveConnected ? 'Drive Connected' : 'Drive Disconnected'}
                    variant={isDriveConnected ? 'success' : 'neutral'}
                  />
                </View>
              </View>

              {/* 1. Automatic Cloud Backup (Always ON) */}
              <SettingRow
                icon="sync-outline"
                iconBg={isDark ? '#064e3b' : '#dcfce7'}
                iconColor="#16a34a"
                title="Automatic Cloud Backup"
                subtitle="Always active. Business records sync automatically to Google Drive on every change."
                badge="Always ON"
                badgeVariant="success"
                colors={colors}
                showArrow={false}
                onPress={() => {
                  Alert.alert(
                    'Always-On Cloud Backup',
                    'Hisab Money continuously protects your business ledger. Every time you create or edit a customer, record a due, or receive a payment, your changes are safely committed to local storage first and queued for automatic cloud backup.'
                  );
                }}
              />

              {/* 2. Manual Back Up Now */}
              <SettingRow
                icon="cloud-upload-outline"
                iconBg={isDark ? '#082f49' : '#e0f2fe'}
                iconColor="#0284c7"
                title="Back Up Now"
                subtitle="Update your primary Hisab Money backup in Google Drive immediately"
                colors={colors}
                onPress={() => {
                  setCloudDetailsModalVisible(false);
                  handleDriveBackup();
                }}
                loading={uploadInProgress}
              />

              {/* 3. Daily Backup Attempt */}
              <SettingRow
                icon="hourglass-outline"
                iconBg={isDark ? '#1e293b' : '#f1f5f9'}
                iconColor={isDark ? '#94a3b8' : '#475569'}
                title="Daily Backup Attempt"
                subtitle="Best-effort 24h background sync when device is idle and connected to network"
                badge="24h Sync"
                badgeVariant="neutral"
                colors={colors}
                showArrow={false}
                onPress={() => {
                  Alert.alert(
                    'Daily Backup Attempt',
                    'Hisab Money schedules a best-effort daily background backup attempt (every ~24 hours). Android battery optimization and network availability may adjust exact timing. Real Android background fetch is active.'
                  );
                }}
              />

              {/* 4. Drive Connection / Disconnection action */}
              <View style={{ marginTop: SPACING[3] }}>
                {isDriveConnected ? (
                  <TouchableOpacity
                    style={{
                      paddingVertical: SPACING[3],
                      borderRadius: RADIUS.lg,
                      borderWidth: 1,
                      borderColor: '#fca5a5',
                      backgroundColor: isDark ? '#450a0a' : '#fef2f2',
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      setCloudDetailsModalVisible(false);
                      handleConnectDrive();
                    }}
                  >
                    <Text style={{ color: '#dc2626', fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.sm }}>
                      Disconnect Google Drive
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.connectDriveButton}
                    onPress={() => {
                      setCloudDetailsModalVisible(false);
                      handleConnectDrive();
                    }}
                    disabled={loadingDrive}
                  >
                    {loadingDrive ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="logo-google" size={16} color="#ffffff" />
                        <Text style={styles.connectDriveButtonText}>Connect Google Drive</Text>
                      </>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── 0B. BACKUP & RECOVERY MODAL (Section 8) ─────────────────────────── */}
      <Modal
        visible={recoveryModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRecoveryModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setRecoveryModalVisible(false)}
        >
          <View
            style={[styles.modalSheet, { backgroundColor: colors.white }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.modalHandle} />
            <View style={[styles.modalHeader, { borderBottomColor: colors.borderLight }]}>
              <View>
                <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                  Backup & Recovery
                </Text>
                <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textMuted }}>
                  Safely restore your business records or manage local snapshots
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setRecoveryModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              {/* Option 1: Restore from Google Drive */}
              <View
                style={[
                  styles.detailsCard,
                  {
                    backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                    borderColor: colors.borderLight,
                    marginVertical: SPACING[2],
                    padding: SPACING[3],
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: isDark ? '#2e1065' : '#ede9fe',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="cloud-download-outline" size={20} color="#7c3aed" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary }}>
                      {t('settings.driveRestoreTitle')}
                    </Text>
                    <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textSecondary }}>
                      {isDriveConnected
                        ? "Select and restore latest backup from 'Hisab Money' folder"
                        : "Connect Google Drive to restore from your cloud backup"}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: isDriveConnected ? '#7c3aed' : colors.primary,
                    paddingVertical: SPACING[2],
                    paddingHorizontal: SPACING[4],
                    borderRadius: RADIUS.md,
                    alignItems: 'center',
                    marginTop: 6,
                  }}
                  onPress={() => {
                    setRecoveryModalVisible(false);
                    if (!isDriveConnected) {
                      handleConnectDrive();
                    } else {
                      handleOpenDriveRestore();
                    }
                  }}
                >
                  <Text style={{ color: '#ffffff', fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.xs }}>
                    {isDriveConnected ? 'Restore from Google Drive' : 'Connect Drive to Restore'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Option 2: Create Local Backup */}
              <View
                style={[
                  styles.detailsCard,
                  {
                    backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                    borderColor: colors.borderLight,
                    marginVertical: SPACING[2],
                    padding: SPACING[3],
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: isDark ? '#064e3b' : '#dcfce7',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="save-outline" size={20} color="#16a34a" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary }}>
                      {t('settings.backupNowTitle')}
                    </Text>
                    <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textSecondary }}>
                      Save an offline snapshot of customers, dues, and payments locally
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={{
                    backgroundColor: colors.primary,
                    paddingVertical: SPACING[2],
                    paddingHorizontal: SPACING[4],
                    borderRadius: RADIUS.md,
                    alignItems: 'center',
                    marginTop: 6,
                  }}
                  onPress={handleLocalBackup}
                  disabled={localBackupLoading}
                >
                  {localBackupLoading ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <Text style={{ color: '#ffffff', fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.xs }}>
                      Create Local Backup
                    </Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Option 3: Restore Local Backup (Only active if usable backup exists) */}
              <View
                style={[
                  styles.detailsCard,
                  {
                    backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                    borderColor: colors.borderLight,
                    marginVertical: SPACING[2],
                    padding: SPACING[3],
                  },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: isDark ? '#451a03' : '#fef3c7',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="refresh-circle-outline" size={20} color="#d97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: FONT_SIZES.sm, fontWeight: FONT_WEIGHTS.bold, color: colors.textPrimary }}>
                      {t('settings.restoreTitle')}
                    </Text>
                    <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textSecondary }}>
                      {savedLocalBackup
                        ? `Available: ${new Date(savedLocalBackup.createdAt).toLocaleDateString()} • ${savedLocalBackup.customersCount} Cust, ${savedLocalBackup.duesCount} Dues, ${savedLocalBackup.paymentsCount} Pymts`
                        : 'No local backup found on this device'}
                    </Text>
                  </View>
                </View>

                {savedLocalBackup ? (
                  <TouchableOpacity
                    style={{
                      backgroundColor: '#d97706',
                      paddingVertical: SPACING[2],
                      paddingHorizontal: SPACING[4],
                      borderRadius: RADIUS.md,
                      alignItems: 'center',
                      marginTop: 6,
                    }}
                    onPress={handleLocalRestore}
                    disabled={localRestoreLoading}
                  >
                    {localRestoreLoading ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={{ color: '#ffffff', fontWeight: FONT_WEIGHTS.bold, fontSize: FONT_SIZES.xs }}>
                        Restore Local Backup
                      </Text>
                    )}
                  </TouchableOpacity>
                ) : (
                  <View
                    style={{
                      paddingVertical: SPACING[2],
                      alignItems: 'center',
                      backgroundColor: isDark ? '#334155' : '#f1f5f9',
                      borderRadius: RADIUS.md,
                      marginTop: 6,
                    }}
                  >
                    <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textMuted }}>
                      Create a local backup first to enable restore
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── A. UPLOAD CONFIRMATION POPUP ───────────────────────────────────── */}
      <Modal
        visible={uploadConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!uploadInProgress) setUploadConfirmVisible(false);
        }}
      >
        <View style={styles.centerModalOverlay}>
          <View style={[styles.confirmModalCard, { backgroundColor: colors.white }]}>
            <View
              style={[
                styles.confirmIconContainer,
                { backgroundColor: isDark ? '#064e3b' : '#dcfce7' },
              ]}
            >
              <Ionicons name="cloud-upload" size={32} color={colors.primary} />
            </View>

            <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
              {t('settings.uploadConfirmTitle')}
            </Text>

            <Text style={[styles.confirmSubtitle, { color: colors.textSecondary }]}>
              {t('settings.uploadConfirmSubtitle')}
            </Text>

            {/* Inspection details card */}
            <View
              style={[
                styles.detailsCard,
                {
                  backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                  borderColor: colors.borderLight,
                },
              ]}
            >
              {fetchingUploadSummary ? (
                <View style={{ paddingVertical: SPACING[3], alignItems: 'center', gap: 6 }}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textMuted }}>
                    Collecting local data...
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textMuted }]}>
                      {t('settings.uploadDestinationLabel')}:
                    </Text>
                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>
                      {t('settings.uploadDestinationVal')}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textMuted }]}>
                      {t('settings.backupCustomersLabel')}:
                    </Text>
                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>
                      {uploadSnapshotSummary ? uploadSnapshotSummary.customersCount : 0}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textMuted }]}>
                      {t('settings.backupDuesLabel')}:
                    </Text>
                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>
                      {uploadSnapshotSummary ? uploadSnapshotSummary.duesCount : 0}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textMuted }]}>
                      {t('settings.backupPaymentsLabel')}:
                    </Text>
                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>
                      {uploadSnapshotSummary ? uploadSnapshotSummary.paymentsCount : 0}
                    </Text>
                  </View>
                </>
              )}
            </View>

            {/* Actions */}
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.borderLight }]}
                onPress={() => setUploadConfirmVisible(false)}
                activeOpacity={0.7}
                delayPressIn={0}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                  {t('settings.cancelBtn')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.restoreBtn,
                  { backgroundColor: colors.primary },
                  fetchingUploadSummary && { opacity: 0.6 },
                ]}
                onPress={handleConfirmExecuteUpload}
                disabled={fetchingUploadSummary}
                activeOpacity={0.8}
                delayPressIn={0}
              >
                <Text style={styles.restoreBtnText}>{t('settings.uploadNowBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── B. NON-DISMISSIBLE UPLOAD PROGRESS MODAL ───────────────────────── */}
      <Modal
        visible={uploadProgressModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!uploadInProgress) setUploadProgressModalVisible(false);
        }}
      >
        <View style={styles.centerModalOverlay}>
          <View style={[styles.progressModalCard, { backgroundColor: colors.white }]}>
            {/* Header Icon reflecting status */}
            {uploadStage === 'COMPLETED' ? (
              <View
                style={[
                  styles.progressStatusIcon,
                  { backgroundColor: isDark ? '#064e3b' : '#dcfce7' },
                ]}
              >
                <Ionicons name="checkmark-circle" size={44} color="#16a34a" />
              </View>
            ) : uploadStage === 'FAILED' ? (
              <View
                style={[
                  styles.progressStatusIcon,
                  { backgroundColor: isDark ? '#450a0a' : '#fee2e2' },
                ]}
              >
                <Ionicons name="alert-circle" size={44} color="#dc2626" />
              </View>
            ) : (
              <View
                style={[
                  styles.progressStatusIcon,
                  { backgroundColor: isDark ? '#064e3b' : '#dcfce7' },
                ]}
              >
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}

            <Text style={[styles.progressTitle, { color: colors.textPrimary }]}>
              {uploadStage === 'COMPLETED'
                ? t('settings.uploadSuccessTitle')
                : uploadStage === 'FAILED'
                  ? t('settings.uploadErrorTitle')
                  : t('settings.uploadProgressTitle')}
            </Text>

            {/* Current Stage Label */}
            <Text style={[styles.progressStageLabel, { color: colors.textSecondary }]}>
              {uploadStageLabel}
            </Text>

            {/* Clean Progress Bar with real measured percentage */}
            {uploadStage !== 'FAILED' && (
              <View style={styles.progressContainer}>
                <View
                  style={[
                    styles.progressBarTrack,
                    { backgroundColor: isDark ? '#334155' : '#e2e8f0' },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, Math.max(0, uploadProgressPercent))}%`,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.progressPercentText, { color: colors.primary }]}>
                  {uploadProgressPercent}%
                </Text>
              </View>
            )}

            {/* Measured Stage Indicators */}
            {uploadStage !== 'FAILED' && uploadStage !== 'COMPLETED' && (
              <View style={styles.stagesList}>
                {[
                  {
                    stage: 'PREPARING',
                    label: '1. Prepare Local Data',
                    active: uploadStage === 'PREPARING',
                    done:
                      uploadStage === 'CREATING' ||
                      uploadStage === 'SECURING' ||
                      uploadStage === 'UPLOADING' ||
                      uploadStage === 'FINALIZING',
                  },
                  {
                    stage: 'CREATING',
                    label: '2. Create Backup Snapshot',
                    active: uploadStage === 'CREATING',
                    done:
                      uploadStage === 'SECURING' ||
                      uploadStage === 'UPLOADING' ||
                      uploadStage === 'FINALIZING',
                  },
                  {
                    stage: 'SECURING',
                    label: '3. Verify Data Integrity',
                    active: uploadStage === 'SECURING',
                    done:
                      uploadStage === 'UPLOADING' ||
                      uploadStage === 'FINALIZING',
                  },
                  {
                    stage: 'UPLOADING',
                    label: '4. Upload to Google Drive',
                    active: uploadStage === 'UPLOADING',
                    done: uploadStage === 'FINALIZING',
                  },
                  {
                    stage: 'FINALIZING',
                    label: '5. Finalize Cloud Backup',
                    active: uploadStage === 'FINALIZING',
                    done: false,
                  },
                ].map((s, idx) => (
                  <View key={idx} style={styles.stageItemRow}>
                    {s.done ? (
                      <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                    ) : s.active ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={14} color={colors.textMuted} />
                    )}
                    <Text
                      style={[
                        styles.stageItemText,
                        {
                          color: s.done
                            ? '#16a34a'
                            : s.active
                              ? colors.textPrimary
                              : colors.textMuted,
                          fontWeight: s.active ? FONT_WEIGHTS.bold : FONT_WEIGHTS.normal,
                        },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Error Message if Failed */}
            {uploadStage === 'FAILED' && (
              <View style={[styles.errorBox, { backgroundColor: isDark ? '#450a0a' : '#fef2f2' }]}>
                <Text style={styles.errorText}>
                  {uploadError || uploadProgressDetails || 'Unknown error during backup upload.'}
                </Text>
                <Text style={[styles.errorSub, { color: colors.textMuted }]}>
                  Your local records remain 100% safe and intact.
                </Text>
              </View>
            )}

            {/* Success Summary if Completed */}
            {uploadStage === 'COMPLETED' && uploadResult && (
              <View
                style={[
                  styles.successBox,
                  {
                    backgroundColor: isDark ? '#064e3b' : '#f0fdf4',
                    borderColor: isDark ? '#059669' : '#bbf7d0',
                  },
                ]}
              >
                <Text style={[styles.successCounts, { color: isDark ? '#4ade80' : '#15803d' }]}>
                  • {uploadResult.customersCount} Customers backed up
                </Text>
                <Text style={[styles.successCounts, { color: isDark ? '#4ade80' : '#15803d' }]}>
                  • {uploadResult.duesCount} Dues transactions saved
                </Text>
                <Text style={[styles.successCounts, { color: isDark ? '#4ade80' : '#15803d' }]}>
                  • {uploadResult.paymentsCount} Payments recorded
                </Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4 }}>
                  Date: {formatDateTime(uploadResult.timestamp, i18n.language)}
                </Text>
              </View>
            )}

            {/* Action buttons upon Completed */}
            {uploadStage === 'COMPLETED' && (
              <View style={{ width: '100%', gap: 8 }}>
                {uploadResult?.pdfUri && (
                  <TouchableOpacity
                    style={[
                      styles.cancelBtn,
                      {
                        borderColor: colors.primary,
                        backgroundColor: isDark ? '#064e3b' : '#dcfce7',
                        marginTop: SPACING[2],
                      },
                    ]}
                    onPress={async () => {
                      try {
                        const { PdfReportService } = require('../../services/pdfReportService');
                        await PdfReportService.shareOrViewPdf(uploadResult.pdfUri!);
                      } catch (e: any) {
                        Alert.alert('PDF Viewer', e?.message || 'Could not open PDF viewer.');
                      }
                    }}
                    activeOpacity={0.8}
                    delayPressIn={0}
                  >
                    <Text
                      style={[
                        styles.cancelBtnText,
                        { color: colors.primary, fontWeight: FONT_WEIGHTS.bold },
                      ]}
                    >
                      {t('settings.viewPdfReportBtn')}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={[styles.doneBtn, { backgroundColor: colors.primary }]}
                  onPress={() => setUploadProgressModalVisible(false)}
                  activeOpacity={0.8}
                  delayPressIn={0}
                >
                  <Text style={styles.doneBtnText}>{t('settings.doneBtn')}</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Action buttons upon Failed */}
            {uploadStage === 'FAILED' && (
              <View style={styles.confirmBtnRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.borderLight }]}
                  onPress={() => setUploadProgressModalVisible(false)}
                  activeOpacity={0.7}
                  delayPressIn={0}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                    {t('settings.cancelBtn')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.restoreBtn, { backgroundColor: colors.primary }]}
                  onPress={handleConfirmExecuteUpload}
                  activeOpacity={0.8}
                  delayPressIn={0}
                >
                  <Text style={styles.restoreBtnText}>{t('settings.retryBtn')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── 1. RESTORE CONFIRMATION POPUP ──────────────────────────────────── */}
      <Modal
        visible={confirmModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!fetchingSnapshot) setConfirmModalVisible(false);
        }}
      >
        <View style={styles.centerModalOverlay}>
          <View style={[styles.confirmModalCard, { backgroundColor: colors.white }]}>
            <View style={styles.confirmIconContainer}>
              <Ionicons name="cloud-download" size={32} color={colors.primary} />
            </View>

            <Text style={[styles.confirmTitle, { color: colors.textPrimary }]}>
              {t('settings.restoreConfirmTitle')}
            </Text>

            <Text style={[styles.confirmSubtitle, { color: colors.textSecondary }]}>
              {t('settings.restoreConfirmSubtitle')}
            </Text>

            {/* Inspection details card */}
            <View
              style={[
                styles.detailsCard,
                {
                  backgroundColor: isDark ? '#1e293b' : '#f8fafc',
                  borderColor: colors.borderLight,
                },
              ]}
            >
              {fetchingSnapshot ? (
                <View style={{ paddingVertical: SPACING[3], alignItems: 'center', gap: 6 }}>
                  <ActivityIndicator color={colors.primary} />
                  <Text style={{ fontSize: FONT_SIZES.xs, color: colors.textMuted }}>
                    {loadingDrive ? 'Connecting to Google Drive...' : 'Verifying backup content...'}
                  </Text>
                </View>
              ) : (
                <>
                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textMuted }]}>
                      {t('settings.backupDateLabel')}:
                    </Text>
                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>
                      {selectedSnapshot?.createdAt
                        ? formatDateTime(selectedSnapshot.createdAt, i18n.language)
                        : selectedBackupFile?.modifiedTime
                          ? formatDateTime(selectedBackupFile.modifiedTime, i18n.language)
                          : selectedBackupFile?.createdTime
                            ? formatDateTime(selectedBackupFile.createdTime, i18n.language)
                            : '—'}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textMuted }]}>
                      {t('settings.backupCustomersLabel')}:
                    </Text>
                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>
                      {selectedSnapshot ? selectedSnapshot.customersCount : 'Available'}
                      {restoreDiff ? ` (${restoreDiff.newCustomers} new)` : ''}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textMuted }]}>
                      {t('settings.backupDuesLabel')}:
                    </Text>
                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>
                      {selectedSnapshot ? selectedSnapshot.duesCount : 'Available'}
                      {restoreDiff ? ` (${restoreDiff.newDues} new)` : ''}
                    </Text>
                  </View>

                  <View style={styles.detailRow}>
                    <Text style={[styles.detailKey, { color: colors.textMuted }]}>
                      {t('settings.backupPaymentsLabel')}:
                    </Text>
                    <Text style={[styles.detailVal, { color: colors.textPrimary }]}>
                      {selectedSnapshot ? selectedSnapshot.paymentsCount : 'Available'}
                      {restoreDiff ? ` (${restoreDiff.newPayments} new)` : ''}
                    </Text>
                  </View>

                  {/* Multi-Device / Existing Records Comparison */}
                  {restoreDiff && (
                    <View
                      style={{
                        marginTop: 8,
                        paddingTop: 8,
                        borderTopWidth: 1,
                        borderTopColor: colors.borderLight,
                      }}
                    >
                      <View style={styles.detailRow}>
                        <Text style={[styles.detailKey, { color: colors.textMuted }]}>
                          Device Existing Records:
                        </Text>
                        <Text style={[styles.detailVal, { color: colors.textPrimary, fontSize: 11 }]}>
                          {(restoreDiff.existingCustomers || 0) + (restoreDiff.localOnlyCustomers || 0)} Cust • {(restoreDiff.existingDues || 0) + (restoreDiff.localOnlyDues || 0)} Dues • {(restoreDiff.existingPayments || 0) + (restoreDiff.localOnlyPayments || 0)} Pymts
                        </Text>
                      </View>

                      {restoreDiff.hasStaleRisk ? (
                        <View
                          style={{
                            marginTop: 6,
                            padding: 8,
                            borderRadius: 6,
                            backgroundColor: isDark ? '#451a03' : '#fef3c7',
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              color: isDark ? '#fde68a' : '#92400e',
                              fontWeight: '600',
                            }}
                          >
                            ⚠️ Multi-Device Notice: Your device has local transactions not present in this cloud backup. A safety backup will be saved first, and local transactions will be preserved without deletion.
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  )}
                </>
              )}
            </View>

            {/* Actions */}
            <View style={styles.confirmBtnRow}>
              <TouchableOpacity
                style={[styles.cancelBtn, { borderColor: colors.borderLight }]}
                onPress={() => setConfirmModalVisible(false)}
                activeOpacity={0.7}
                delayPressIn={0}
              >
                <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                  {t('settings.cancelBtn')}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.restoreBtn,
                  { backgroundColor: colors.primary },
                  fetchingSnapshot && { opacity: 0.6 },
                ]}
                onPress={handleConfirmExecuteRestore}
                disabled={fetchingSnapshot}
                activeOpacity={0.8}
                delayPressIn={0}
              >
                <Text style={styles.restoreBtnText}>{t('settings.restoreNowBtn')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 2. NON-DISMISSIBLE PROGRESS MODAL ──────────────────────────────── */}
      <Modal
        visible={progressModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          // Non-dismissible while restore is in-flight
          if (!restoreInProgress) setProgressModalVisible(false);
        }}
      >
        <View style={styles.centerModalOverlay}>
          <View style={[styles.progressModalCard, { backgroundColor: colors.white }]}>
            {/* Header Icon reflecting current status */}
            {restoreStage === 'COMPLETED' ? (
              <View style={[styles.progressStatusIcon, { backgroundColor: '#dcfce7' }]}>
                <Ionicons name="checkmark-circle" size={44} color="#16a34a" />
              </View>
            ) : restoreStage === 'FAILED' ? (
              <View style={[styles.progressStatusIcon, { backgroundColor: '#fee2e2' }]}>
                <Ionicons name="alert-circle" size={44} color="#dc2626" />
              </View>
            ) : (
              <View
                style={[
                  styles.progressStatusIcon,
                  { backgroundColor: isDark ? '#064e3b' : '#dcfce7' },
                ]}
              >
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
            )}

            <Text style={[styles.progressTitle, { color: colors.textPrimary }]}>
              {restoreStage === 'COMPLETED'
                ? t('settings.restoreSuccessTitle')
                : restoreStage === 'FAILED'
                  ? t('settings.restoreErrorTitle')
                  : t('settings.restoreProgressTitle')}
            </Text>

            {/* Current Stage Label */}
            <Text style={[styles.progressStageLabel, { color: colors.textSecondary }]}>
              {progressStageLabel}
            </Text>

            {/* Clean Progress Bar with real measured percentage */}
            {restoreStage !== 'FAILED' && (
              <View style={styles.progressContainer}>
                <View
                  style={[
                    styles.progressBarTrack,
                    { backgroundColor: isDark ? '#334155' : '#e2e8f0' },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.min(100, Math.max(0, progressPercent))}%`,
                        backgroundColor: colors.primary,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.progressPercentText, { color: colors.primary }]}>
                  {progressPercent}%
                </Text>
              </View>
            )}

            {/* Measured Stage Indicators */}
            {restoreStage !== 'FAILED' && restoreStage !== 'COMPLETED' && (
              <View style={styles.stagesList}>
                {[
                  {
                    stage: 'DOWNLOADING',
                    label: '1. Download Backup',
                    active: restoreStage === 'DOWNLOADING',
                    done:
                      restoreStage === 'VALIDATING' ||
                      restoreStage === 'RESTORING_CUSTOMERS' ||
                      restoreStage === 'RESTORING_TRANSACTIONS' ||
                      restoreStage === 'FINALIZING',
                  },
                  {
                    stage: 'VALIDATING',
                    label: '2. Validate Backup Integrity',
                    active: restoreStage === 'VALIDATING',
                    done:
                      restoreStage === 'RESTORING_CUSTOMERS' ||
                      restoreStage === 'RESTORING_TRANSACTIONS' ||
                      restoreStage === 'FINALIZING',
                  },
                  {
                    stage: 'RESTORING_CUSTOMERS',
                    label: '3. Restore Customers',
                    active: restoreStage === 'RESTORING_CUSTOMERS',
                    done:
                      restoreStage === 'RESTORING_TRANSACTIONS' || restoreStage === 'FINALIZING',
                  },
                  {
                    stage: 'RESTORING_TRANSACTIONS',
                    label: '4. Restore Dues & Payments',
                    active: restoreStage === 'RESTORING_TRANSACTIONS',
                    done: restoreStage === 'FINALIZING',
                  },
                  {
                    stage: 'FINALIZING',
                    label: '5. Finalize Restore',
                    active: restoreStage === 'FINALIZING',
                    done: false,
                  },
                ].map((s, idx) => (
                  <View key={idx} style={styles.stageItemRow}>
                    {s.done ? (
                      <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
                    ) : s.active ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Ionicons name="ellipse-outline" size={14} color={colors.textMuted} />
                    )}
                    <Text
                      style={[
                        styles.stageItemText,
                        {
                          color: s.done
                            ? '#16a34a'
                            : s.active
                              ? colors.textPrimary
                              : colors.textMuted,
                          fontWeight: s.active ? FONT_WEIGHTS.bold : FONT_WEIGHTS.normal,
                        },
                      ]}
                    >
                      {s.label}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Error Message if Failed */}
            {restoreStage === 'FAILED' && (
              <View style={[styles.errorBox, { backgroundColor: isDark ? '#450a0a' : '#fef2f2' }]}>
                <Text style={styles.errorText}>
                  {restoreError || progressDetails || 'Unknown error during restore.'}
                </Text>
                <Text style={[styles.errorSub, { color: colors.textMuted }]}>
                  Existing records were preserved safely. No data was lost.
                </Text>
              </View>
            )}

            {/* Success Summary if Completed */}
            {restoreStage === 'COMPLETED' && restoreResult && (
              <View
                style={[
                  styles.successBox,
                  {
                    backgroundColor: isDark ? '#064e3b' : '#f0fdf4',
                    borderColor: isDark ? '#059669' : '#bbf7d0',
                  },
                ]}
              >
                <Text style={[styles.successCounts, { color: isDark ? '#4ade80' : '#15803d' }]}>
                  • {restoreResult.restoredCustomers} Customers restored
                </Text>
                <Text style={[styles.successCounts, { color: isDark ? '#4ade80' : '#15803d' }]}>
                  • {restoreResult.restoredDues} Dues transactions imported
                </Text>
                <Text style={[styles.successCounts, { color: isDark ? '#4ade80' : '#15803d' }]}>
                  • {restoreResult.restoredPayments} Payments recorded
                </Text>
              </View>
            )}

            {/* Action buttons upon Completed or Failed */}
            {restoreStage === 'COMPLETED' && (
              <TouchableOpacity
                style={[styles.doneBtn, { backgroundColor: colors.primary }]}
                onPress={() => setProgressModalVisible(false)}
                activeOpacity={0.8}
                delayPressIn={0}
              >
                <Text style={styles.doneBtnText}>{t('settings.doneBtn')}</Text>
              </TouchableOpacity>
            )}

            {restoreStage === 'FAILED' && (
              <View style={styles.confirmBtnRow}>
                <TouchableOpacity
                  style={[styles.cancelBtn, { borderColor: colors.borderLight }]}
                  onPress={() => setProgressModalVisible(false)}
                  activeOpacity={0.7}
                  delayPressIn={0}
                >
                  <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>
                    {t('settings.cancelBtn')}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.restoreBtn, { backgroundColor: colors.primary }]}
                  onPress={handleConfirmExecuteRestore}
                  activeOpacity={0.8}
                  delayPressIn={0}
                >
                  <Text style={styles.restoreBtnText}>{t('settings.retryBtn')}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Accessible In-App Privacy Policy Modal */}
      <PrivacyPolicyModal
        visible={privacyModalVisible}
        onClose={() => setPrivacyModalVisible(false)}
      />

      {/* Edit Profile Name Modal */}
      <Modal
        visible={editNameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCloseEditNameModal}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          style={styles.editModalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
        >
          <View style={styles.editModalOverlay}>
            <TouchableWithoutFeedback
              onPress={() => {
                if (isKeyboardVisible) {
                  Keyboard.dismiss();
                } else {
                  setEditNameModalVisible(false);
                }
              }}
              accessible={false}
            >
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <View
              style={[
                styles.editNameModalCard,
                { backgroundColor: colors.surfaceCard, borderColor: colors.border },
              ]}
            >
              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.editModalScrollContent}
              >
                <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                  <View>
                    <View style={[styles.editNameHeader, { borderBottomColor: colors.borderLight }]}>
                      <View
                        style={[
                          styles.editNameIconWrap,
                          { backgroundColor: isDark ? '#064e3b' : '#dcfce7' },
                        ]}
                      >
                        <Ionicons name="person-outline" size={20} color={colors.primary} />
                      </View>
                      <View style={styles.editNameHeaderTextWrap}>
                        <Text style={[styles.editNameTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                          {t('settings.editProfileName', 'Edit Profile Name')}
                        </Text>
                        <Text style={[styles.editNameSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                          {t('settings.enterDisplayName', 'Enter Display Name')}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={handleCancelEditName}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        activeOpacity={0.7}
                        style={styles.editNameCloseBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Close"
                      >
                        <Ionicons name="close-circle" size={24} color={colors.textMuted} />
                      </TouchableOpacity>
                    </View>

                    <View style={styles.editNameBody}>
                      <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>
                        {t('settings.enterDisplayName', 'Enter Display Name')} *
                      </Text>

                      <View
                        style={[
                          styles.textInputWrap,
                          {
                            backgroundColor: isDark ? colors.surface : '#f8fafc',
                            borderColor: nameError ? colors.danger : colors.border,
                          },
                        ]}
                      >
                        <TextInput
                          value={customNameInput}
                          onChangeText={(val) => {
                            setCustomNameInput(val);
                            if (nameError) setNameError(null);
                          }}
                          placeholder={t('settings.profileNamePlaceholder', 'e.g. Ani Store or Your Name')}
                          placeholderTextColor={colors.textMuted}
                          maxLength={40}
                          autoCapitalize="words"
                          returnKeyType="done"
                          onSubmitEditing={handleSaveCustomName}
                          autoFocus
                          style={[styles.textInput, { color: colors.textPrimary }]}
                        />
                        {customNameInput.length > 0 && (
                          <TouchableOpacity
                            onPress={() => setCustomNameInput('')}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            activeOpacity={0.7}
                            style={styles.clearInputBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Clear input"
                          >
                            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                          </TouchableOpacity>
                        )}
                      </View>

                      <View style={styles.inputMetaRow}>
                        {nameError ? (
                          <Text style={[styles.inputErrorText, { color: colors.danger }]}>{nameError}</Text>
                        ) : (
                          <Text style={[styles.helperText, { color: colors.textMuted }]}>
                            Max 40 characters
                          </Text>
                        )}
                        <Text style={[styles.charCountText, { color: colors.textMuted }]}>
                          {customNameInput.length}/40
                        </Text>
                      </View>

                      {authUser?.name ? (
                        <View
                          style={[
                            styles.googleHintBox,
                            {
                              backgroundColor: isDark ? colors.surface : '#f8fafc',
                              borderColor: colors.borderLight,
                            },
                          ]}
                        >
                          <Ionicons name="logo-google" size={15} color="#ea4335" style={{ marginRight: 8 }} />
                          <Text style={[styles.googleHintText, { color: colors.textSecondary }]} numberOfLines={1}>
                            {t('settings.googleAccountNote', { name: authUser.name, defaultValue: `Connected Google Account: ${authUser.name}` })}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={[styles.editNameFooter, { borderTopColor: colors.borderLight }]}>
                      <Button
                        title={t('common.cancel', 'Cancel')}
                        onPress={handleCancelEditName}
                        variant="outline"
                        size="md"
                        style={styles.editFooterBtn}
                      />
                      <View style={styles.btnSpacer} />
                      <Button
                        title={t('common.save', 'Save')}
                        onPress={handleSaveCustomName}
                        variant="primary"
                        size="md"
                        loading={savingCustomName}
                        disabled={savingCustomName}
                        style={styles.editFooterBtn}
                      />
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  header: {
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[3],
    paddingBottom: SPACING[2],
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  headerTitle: {
    fontSize: FONT_SIZES['2xl'],
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING[4],
    marginTop: SPACING[4],
    marginBottom: SPACING[3],
    padding: SPACING[4],
    borderRadius: RADIUS.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
    overflow: 'hidden',
  },
  profileAvatarImage: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  profileAvatarText: {
    fontSize: FONT_SIZES.xl,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.white,
  },
  profileInfo: { flex: 1 },
  profileName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  profileBusiness: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.primary,
    fontWeight: FONT_WEIGHTS.medium,
    marginTop: 1,
  },
  profileContact: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  editPencilBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalContainer: {
    flex: 1,
  },
  editModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[4],
    paddingVertical: SPACING[4],
  },
  editNameModalCard: {
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
  editModalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  editNameHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: SPACING[3],
    borderBottomWidth: 1,
    marginBottom: SPACING[2],
  },
  editNameIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  editNameHeaderTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  editNameTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  editNameSubtitle: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  editNameCloseBtn: {
    padding: 2,
    marginLeft: SPACING[2],
  },
  editNameBody: {
    paddingVertical: SPACING[2],
  },
  inputLabel: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
    marginBottom: 6,
  },
  textInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING[3],
    height: 48,
  },
  textInput: {
    flex: 1,
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.medium,
    paddingVertical: 0,
    height: '100%',
  },
  clearInputBtn: {
    padding: 4,
    marginLeft: 4,
  },
  inputMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: SPACING[2],
  },
  inputErrorText: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.medium,
    flex: 1,
  },
  helperText: {
    fontSize: FONT_SIZES.xs,
    flex: 1,
  },
  charCountText: {
    fontSize: FONT_SIZES.xs,
    marginLeft: 8,
  },
  googleHintBox: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING[3],
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: SPACING[2],
  },
  googleHintText: {
    fontSize: FONT_SIZES.xs,
    flex: 1,
  },
  editNameFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: SPACING[3],
    borderTopWidth: 1,
    marginTop: SPACING[3],
  },
  editFooterBtn: {
    flex: 1,
    height: 48,
  },
  btnSpacer: {
    width: 12,
  },
  dbStatusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0fdf4',
    marginHorizontal: SPACING[4],
    marginBottom: SPACING[3],
    padding: SPACING[3],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    gap: SPACING[3],
  },
  dbStatusIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dbStatusTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
    color: '#15803d',
  },
  dbStatusSubtitle: {
    fontSize: 11,
    color: '#166534',
    marginTop: 1,
  },
  section: {
    marginTop: SPACING[4],
  },
  sectionHeader: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
    color: COLORS.textMuted,
    paddingHorizontal: SPACING[4],
    marginBottom: SPACING[2],
    letterSpacing: 0.8,
  },
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: SPACING[4],
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING[3],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  settingIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: SPACING[3],
  },
  settingContent: {
    flex: 1,
  },
  settingTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  settingTitle: {
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.medium,
    color: COLORS.textPrimary,
  },
  settingSubtitle: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  rowBadge: {
    paddingVertical: 1,
    paddingHorizontal: 6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: RADIUS['2xl'],
    borderTopRightRadius: RADIUS['2xl'],
    paddingHorizontal: SPACING[4],
    paddingBottom: SPACING[8],
    paddingTop: SPACING[2],
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: '#cbd5e1',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING[3],
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING[4],
    paddingBottom: SPACING[2],
    borderBottomWidth: 1,
    borderBottomColor: COLORS.borderLight,
  },
  modalTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  langList: {
    gap: SPACING[2],
  },
  langOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING[3],
    borderRadius: RADIUS.lg,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: COLORS.borderLight,
  },
  langOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[3],
  },
  langFlag: {
    fontSize: 26,
  },
  langNativeName: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
    color: COLORS.textPrimary,
  },
  langSubName: {
    fontSize: FONT_SIZES.xs,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.primary,
  },

  // ── Confirmation & Progress Popup Styles ─────────────────────────────────
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SPACING[4],
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: RADIUS['2xl'],
    padding: SPACING[5],
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  confirmIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  confirmTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: SPACING[1],
  },
  confirmSubtitle: {
    fontSize: FONT_SIZES.xs,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: SPACING[4],
  },
  detailsCard: {
    width: '100%',
    padding: SPACING[3],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    marginBottom: SPACING[4],
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  detailKey: {
    fontSize: 12,
  },
  detailVal: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  confirmBtnRow: {
    flexDirection: 'row',
    gap: SPACING[3],
    width: '100%',
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
    fontWeight: FONT_WEIGHTS.semibold,
  },
  restoreBtn: {
    flex: 1,
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restoreBtnText: {
    color: '#ffffff',
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },

  // Progress Card
  progressModalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: RADIUS['2xl'],
    padding: SPACING[5],
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  progressStatusIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING[3],
  },
  progressTitle: {
    fontSize: FONT_SIZES.lg,
    fontWeight: FONT_WEIGHTS.bold,
    textAlign: 'center',
    marginBottom: SPACING[1],
  },
  progressStageLabel: {
    fontSize: FONT_SIZES.xs,
    textAlign: 'center',
    marginBottom: SPACING[3],
  },
  progressContainer: {
    width: '100%',
    alignItems: 'center',
    marginBottom: SPACING[3],
  },
  progressBarTrack: {
    width: '100%',
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: FONT_WEIGHTS.bold,
  },
  stagesList: {
    width: '100%',
    paddingHorizontal: SPACING[2],
    marginVertical: SPACING[2],
    gap: 8,
  },
  stageItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stageItemText: {
    fontSize: 12,
  },
  errorBox: {
    width: '100%',
    padding: SPACING[3],
    borderRadius: RADIUS.md,
    marginVertical: SPACING[3],
  },
  errorText: {
    color: '#dc2626',
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  errorSub: {
    fontSize: 11,
    marginTop: 3,
  },
  successBox: {
    width: '100%',
    padding: SPACING[3],
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginVertical: SPACING[3],
    gap: 4,
  },
  successCounts: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.semibold,
  },
  doneBtn: {
    width: '100%',
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.lg,
    alignItems: 'center',
    marginTop: SPACING[2],
  },
  doneBtnText: {
    color: '#ffffff',
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
  cloudBackupCard: {
    marginHorizontal: SPACING[4],
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
    borderWidth: 1.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cloudBackupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cloudBackupIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cloudBackupTitle: {
    fontSize: FONT_SIZES.md,
    fontWeight: FONT_WEIGHTS.bold,
  },
  cloudBackupSubtitle: {
    fontSize: FONT_SIZES.xs,
    marginTop: 2,
  },
  cloudBackupStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING[3],
    padding: SPACING[3],
    borderRadius: RADIUS.lg,
    borderWidth: 1,
  },
  cloudStatusLabel: {
    fontSize: 11,
    fontWeight: FONT_WEIGHTS.medium,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  cloudStatusValue: {
    fontSize: FONT_SIZES.xs,
    fontWeight: FONT_WEIGHTS.bold,
  },
  connectDriveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#16a34a',
    marginTop: SPACING[3],
    paddingVertical: SPACING[3],
    borderRadius: RADIUS.lg,
  },
  connectDriveButtonText: {
    color: '#ffffff',
    fontSize: FONT_SIZES.sm,
    fontWeight: FONT_WEIGHTS.bold,
  },
});

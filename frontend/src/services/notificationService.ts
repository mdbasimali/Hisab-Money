import { Platform } from 'react-native';

let Notifications: any = null;
let isNotificationsSupported = false;

try {
  const expoNotifications = require('expo-notifications');
  if (expoNotifications && typeof expoNotifications.setNotificationHandler === 'function') {
    try {
      expoNotifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      Notifications = expoNotifications;
      isNotificationsSupported = true;
    } catch (handlerErr) {
      // Native module not linked in current dev client build; fail silently
      Notifications = null;
      isNotificationsSupported = false;
    }
  }
} catch {
  // Ignored in non-native or unlinked environments
  Notifications = null;
  isNotificationsSupported = false;
}

export const BACKUP_CHANNEL_ID = 'hisab_money_backup_channel';

export class NotificationService {
  private static channelInitialized = false;
  private static activeStartNotificationId: string | null = null;

  /**
   * Initialize Android Notification Channel for backup updates
   */
  static async initNotificationChannel(): Promise<void> {
    if (!Notifications || !isNotificationsSupported || Platform.OS !== 'android') return;
    if (this.channelInitialized) return;

    try {
      if (typeof Notifications.setNotificationChannelAsync === 'function') {
        await Notifications.setNotificationChannelAsync(BACKUP_CHANNEL_ID, {
          name: 'Hisab Money Backup Updates',
          importance: Notifications?.AndroidImportance?.DEFAULT ?? 3,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#16a34a',
          showBadge: false,
          description: 'Notifications regarding Hisab Money cloud backup and recovery status.',
        });
        this.channelInitialized = true;
      }
    } catch (e) {
      console.warn('[NotificationService] Channel setup notice:', e);
    }
  }

  /**
   * Request notification permission gracefully.
   * If denied, backups proceed without interruption.
   */
  static async requestNotificationPermission(): Promise<boolean> {
    if (!Notifications || !isNotificationsSupported || Platform.OS === 'web') return false;

    try {
      if (typeof Notifications.getPermissionsAsync === 'function') {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;

        if (existingStatus !== 'granted' && typeof Notifications.requestPermissionsAsync === 'function') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }

        return finalStatus === 'granted';
      }
      return false;
    } catch (e) {
      console.warn('[NotificationService] Permission check error:', e);
      return false;
    }
  }

  /**
   * Check if notification permission is currently granted
   */
  static async hasNotificationPermission(): Promise<boolean> {
    if (!Notifications || !isNotificationsSupported || Platform.OS === 'web') return false;

    try {
      if (typeof Notifications.getPermissionsAsync === 'function') {
        const { status } = await Notifications.getPermissionsAsync();
        return status === 'granted';
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Notification 1: Upload in progress
   * "Backing up your data"
   * "Hisab Money is updating your Google Drive backup."
   */
  static async notifyBackupStarted(): Promise<void> {
    if (!Notifications || !isNotificationsSupported) return;

    try {
      const hasPermission = await this.hasNotificationPermission();
      if (!hasPermission) return;

      await this.initNotificationChannel();

      // Clear any prior progress notification
      if (this.activeStartNotificationId && typeof Notifications.dismissNotificationAsync === 'function') {
        await Notifications.dismissNotificationAsync(this.activeStartNotificationId).catch(() => {});
      }

      if (typeof Notifications.scheduleNotificationAsync === 'function') {
        this.activeStartNotificationId = await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Backing up your data',
            body: 'Hisab Money is updating your Google Drive backup.',
            data: { type: 'backup_progress' },
            sound: false,
            ...(Platform.OS === 'android' ? { channelId: BACKUP_CHANNEL_ID } : {}),
          },
          trigger: null,
        });
      }
    } catch (e) {
      console.warn('[NotificationService] Notify start warning:', e);
    }
  }

  /**
   * Notification 2: Confirmed successful upload
   * "Backup completed successfully"
   * "Your Hisab Money data has been backed up to Google Drive."
   */
  static async notifyBackupSuccess(): Promise<void> {
    if (!Notifications || !isNotificationsSupported) return;

    try {
      const hasPermission = await this.hasNotificationPermission();
      if (!hasPermission) return;

      await this.initNotificationChannel();

      // Dismiss the in-progress notification first
      if (this.activeStartNotificationId && typeof Notifications.dismissNotificationAsync === 'function') {
        await Notifications.dismissNotificationAsync(this.activeStartNotificationId).catch(() => {});
        this.activeStartNotificationId = null;
      }

      if (typeof Notifications.scheduleNotificationAsync === 'function') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'Backup completed successfully',
            body: 'Your Hisab Money data has been backed up to Google Drive.',
            data: { type: 'backup_success' },
            sound: false,
            ...(Platform.OS === 'android' ? { channelId: BACKUP_CHANNEL_ID } : {}),
          },
          trigger: null,
        });
      }
    } catch (e) {
      console.warn('[NotificationService] Notify success warning:', e);
    }
  }

  /**
   * Notification 3: Confirmed upload failure
   * "Backup couldn't be completed"
   * "Your data is still saved locally. We'll retry your backup when possible."
   */
  static async notifyBackupFailed(): Promise<void> {
    if (!Notifications || !isNotificationsSupported) return;

    try {
      const hasPermission = await this.hasNotificationPermission();
      if (!hasPermission) return;

      await this.initNotificationChannel();

      // Dismiss the in-progress notification first
      if (this.activeStartNotificationId && typeof Notifications.dismissNotificationAsync === 'function') {
        await Notifications.dismissNotificationAsync(this.activeStartNotificationId).catch(() => {});
        this.activeStartNotificationId = null;
      }

      if (typeof Notifications.scheduleNotificationAsync === 'function') {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: "Backup couldn't be completed",
            body: "Your data is still saved locally. We'll retry your backup when possible.",
            data: { type: 'backup_failure' },
            sound: false,
            ...(Platform.OS === 'android' ? { channelId: BACKUP_CHANNEL_ID } : {}),
          },
          trigger: null,
        });
      }
    } catch (e) {
      console.warn('[NotificationService] Notify failed warning:', e);
    }
  }

  /**
   * Dismiss any lingering backup notifications
   */
  static async dismissActiveProgress(): Promise<void> {
    if (!Notifications || !isNotificationsSupported) return;
    try {
      if (this.activeStartNotificationId && typeof Notifications.dismissNotificationAsync === 'function') {
        await Notifications.dismissNotificationAsync(this.activeStartNotificationId).catch(() => {});
        this.activeStartNotificationId = null;
      }
    } catch {}
  }
}

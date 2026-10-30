import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { GoogleDriveBackupService } from './googleDriveService';
import { NotificationService } from './notificationService';

export type BackupState = 'UP_TO_DATE' | 'PENDING' | 'BACKING_UP' | 'FAILED';

export interface BackupStatusInfo {
  state: BackupState;
  lastBackupTime: string | null;
  lastError: string | null;
  isDriveConnected: boolean;
  message?: string;
}

const PENDING_WORK_KEY = 'hisab_money_backup_pending_work';
const LAST_BACKUP_TIME_KEY = 'hisab_money_last_backup_time';
const LAST_ERROR_KEY = 'hisab_money_last_backup_error';

export class BackupQueueService {
  private static currentState: BackupState = 'UP_TO_DATE';
  private static debounceTimer: any = null;
  private static retryTimer: any = null;
  private static isUploading = false;
  private static queuedChangesDuringUpload = false;
  private static retryCount = 0;
  private static maxRetries = 5;
  private static lastError: string | null = null;
  private static listeners: Set<(status: BackupStatusInfo) => void> = new Set();
  private static initialized = false;

  /**
   * Subscribe to backup status updates for reactive UI in Settings & elsewhere
   */
  static subscribe(listener: (status: BackupStatusInfo) => void): () => void {
    this.listeners.add(listener);
    // Send immediate current state
    this.getStatus().then((status) => listener(status));
    return () => {
      this.listeners.delete(listener);
    };
  }

  private static notifyListeners(status: BackupStatusInfo) {
    this.currentState = status.state;
    this.lastError = status.lastError;
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (e) {
        console.warn('[BackupQueue] Listener error:', e);
      }
    });
  }

  /**
   * Initialize queue and check for pending work from prior session
   */
  static async init(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;

    try {
      const hasPending = await this.getPendingWorkFlag();
      if (hasPending) {
        this.currentState = 'PENDING';
        this.notifyStatus('Pending backup from previous session');
        // Attempt processing after brief settling period
        setTimeout(() => {
          this.processQueue('app_init');
        }, 3000);
      } else {
        const lastTime = await this.getLastBackupTime();
        if (lastTime) {
          this.currentState = 'UP_TO_DATE';
        }
      }
    } catch (e) {
      console.warn('[BackupQueue] Init check warning:', e);
    }
  }

  /**
   * Reads persistent pending work flag
   */
  static async getPendingWorkFlag(): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(PENDING_WORK_KEY) === 'true';
      }
      const val = await SecureStore.getItemAsync(PENDING_WORK_KEY);
      return val === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Sets persistent pending work flag
   */
  static async setPendingWorkFlag(pending: boolean): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (pending) {
          localStorage.setItem(PENDING_WORK_KEY, 'true');
        } else {
          localStorage.removeItem(PENDING_WORK_KEY);
        }
      } else {
        if (pending) {
          await SecureStore.setItemAsync(PENDING_WORK_KEY, 'true');
        } else {
          await SecureStore.deleteItemAsync(PENDING_WORK_KEY);
        }
      }
    } catch (e) {
      console.warn('[BackupQueue] Failed to persist pending work flag:', e);
    }
  }

  static async getLastBackupTime(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(LAST_BACKUP_TIME_KEY);
      }
      return await SecureStore.getItemAsync(LAST_BACKUP_TIME_KEY);
    } catch {
      return null;
    }
  }

  static async setLastBackupTime(timeIso: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(LAST_BACKUP_TIME_KEY, timeIso);
      } else {
        await SecureStore.setItemAsync(LAST_BACKUP_TIME_KEY, timeIso);
      }
    } catch (e) {
      console.warn('[BackupQueue] Failed to persist last backup time:', e);
    }
  }

  /**
   * Returns current comprehensive backup status
   */
  static async getStatus(): Promise<BackupStatusInfo> {
    const isDriveConnected = await GoogleDriveBackupService.isDriveConnected();
    const lastBackupTime = await this.getLastBackupTime();
    const hasPending = await this.getPendingWorkFlag();

    let state: BackupState = this.currentState;
    if (this.isUploading) {
      state = 'BACKING_UP';
    } else if (hasPending) {
      state = isDriveConnected ? 'PENDING' : 'PENDING';
    }

    return {
      state,
      lastBackupTime,
      lastError: this.lastError,
      isDriveConnected,
      message: !isDriveConnected
        ? 'Google Drive is disconnected. Connect Google Drive to sync backups.'
        : state === 'PENDING'
          ? 'Changes saved locally. Cloud backup pending.'
          : state === 'BACKING_UP'
            ? 'Backing up to Google Drive...'
            : state === 'FAILED'
              ? 'Backup failed. Will retry automatically.'
              : 'All business records are safely backed up.',
    };
  }

  private static async notifyStatus(customMessage?: string) {
    const status = await this.getStatus();
    if (customMessage) {
      status.message = customMessage;
    }
    this.notifyListeners(status);
  }

  /**
   * Trigger automatic backup after successful local database change.
   * Coalesces rapid sequential changes using a debounce timer.
   */
  static triggerAutoBackup(reason: string = 'data_change'): void {
    // 1. Mark pending work immediately so it is never lost if interrupted
    this.setPendingWorkFlag(true);
    this.currentState = 'PENDING';
    this.notifyStatus('Changes saved locally. Cloud backup queued.');

    // 2. Clear any pending debounce
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // 3. Coalesce rapid changes (2.5 second window)
    this.debounceTimer = setTimeout(() => {
      this.processQueue(reason);
    }, 2500);
  }

  /**
   * Process the backup queue. Serialized: prevents overlapping uploads.
   */
  static async processQueue(triggerSource: string = 'queue'): Promise<{ success: boolean; message: string }> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // If an upload is already in flight, mark newer changes pending and return
    if (this.isUploading) {
      this.queuedChangesDuringUpload = true;
      return {
        success: false,
        message: 'Upload already in progress. Changes queued for next snapshot.',
      };
    }

    // Check Drive authorization
    const isDriveConnected = await GoogleDriveBackupService.isDriveConnected();
    if (!isDriveConnected) {
      // Retain pending work; do not drop it!
      await this.setPendingWorkFlag(true);
      this.currentState = 'PENDING';
      this.notifyStatus('Pending Google Drive connection. Connect Drive in Settings to backup.');
      return {
        success: false,
        message: 'Google Drive is not connected. Pending cloud backup retained.',
      };
    }

    this.isUploading = true;
    this.currentState = 'BACKING_UP';
    this.notifyStatus('Hisab Money is updating your Google Drive backup...');

    // Start background start-notification after 1.5s if upload is still progressing
    let startNotifTimer: any = setTimeout(() => {
      if (this.isUploading) {
        NotificationService.notifyBackupStarted();
      }
    }, 1500);

    try {
      const result = await GoogleDriveBackupService.uploadBackupToDrive();

      clearTimeout(startNotifTimer);

      if (result.success) {
        const nowIso = new Date().toISOString();
        await this.setLastBackupTime(nowIso);
        await this.setPendingWorkFlag(false);
        this.currentState = 'UP_TO_DATE';
        this.lastError = null;
        this.retryCount = 0;

        await NotificationService.notifyBackupSuccess();
        await this.notifyStatus('Backup completed successfully.');

        return {
          success: true,
          message: result.message || 'Backup completed successfully.',
        };
      } else {
        throw new Error(result.message || 'Google Drive upload failed.');
      }
    } catch (err: any) {
      clearTimeout(startNotifTimer);
      const errMsg = err?.message || 'Google Drive backup could not be completed.';
      console.warn('[BackupQueue] Upload error:', errMsg);

      this.lastError = errMsg;
      this.currentState = 'FAILED';
      await this.setPendingWorkFlag(true); // Retain pending work

      await NotificationService.notifyBackupFailed();
      await this.notifyStatus(errMsg);

      // Schedule bounded exponential backoff retry if under maxRetries
      this.scheduleRetry();

      return {
        success: false,
        message: errMsg,
      };
    } finally {
      this.isUploading = false;

      // If changes occurred during upload, immediately process the next coalesced snapshot
      if (this.queuedChangesDuringUpload) {
        this.queuedChangesDuringUpload = false;
        setTimeout(() => {
          this.processQueue('queued_during_upload');
        }, 500);
      }
    }
  }

  /**
   * Schedule exponential backoff retry for transient failures
   */
  private static scheduleRetry(): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    if (this.retryCount >= this.maxRetries) {
      console.log('[BackupQueue] Max retries reached. Will retry on next data change or app launch.');
      return;
    }

    this.retryCount++;
    // Exponential backoff: 5s, 15s, 45s, 135s (max 5 minutes)
    const delayMs = Math.min(5000 * Math.pow(3, this.retryCount - 1), 300000);
    console.log(`[BackupQueue] Scheduling retry #${this.retryCount} in ${delayMs / 1000} seconds...`);

    this.retryTimer = setTimeout(() => {
      this.processQueue('retry_backoff');
    }, delayMs);
  }

  /**
   * Resume pending work on app launch, foreground resume, or connectivity return
   */
  static async resumePendingWork(): Promise<void> {
    const hasPending = await this.getPendingWorkFlag();
    if (hasPending && !this.isUploading) {
      console.log('[BackupQueue] Resuming pending backup work...');
      await this.processQueue('resume');
    }
  }

  /**
   * Trigger immediate manual backup ("Back Up Now")
   */
  static async backUpNow(): Promise<{ success: boolean; message: string }> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    return this.processQueue('manual_now');
  }
}

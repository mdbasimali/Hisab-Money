import { Platform, AppState, AppStateStatus } from 'react-native';

let TaskManager: any = null;
let BackgroundFetch: any = null;
let isBackgroundTaskSupported = false;

export const HISAB_MONEY_DAILY_BACKUP_TASK = 'HISAB_MONEY_DAILY_BACKUP_TASK';

try {
  const tm = require('expo-task-manager');
  const bf = require('expo-background-fetch');
  if (tm && typeof tm.defineTask === 'function') {
    try {
      tm.defineTask(HISAB_MONEY_DAILY_BACKUP_TASK, async () => {
        try {
          console.log('[DailyBackup] Background task executing daily best-effort backup...');
          const { BackupQueueService } = require('./backupQueueService');
          const result = await BackupQueueService.processQueue('daily_background_task');
          if (result?.success && bf?.BackgroundFetchResult?.NewData) {
            return bf.BackgroundFetchResult.NewData;
          }
          return bf?.BackgroundFetchResult?.NoData ?? 1;
        } catch (err) {
          console.warn('[DailyBackup] Background task execution failed:', err);
          return bf?.BackgroundFetchResult?.Failed ?? 2;
        }
      });
      TaskManager = tm;
      BackgroundFetch = bf;
      isBackgroundTaskSupported = true;
    } catch {
      // Native TaskManager not linked in current build
      TaskManager = null;
      BackgroundFetch = null;
      isBackgroundTaskSupported = false;
    }
  }
} catch (e) {
  // Ignored in non-native / test environments
  TaskManager = null;
  BackgroundFetch = null;
  isBackgroundTaskSupported = false;
}

export class DailyBackupService {
  private static registered = false;
  private static appStateSubscription: any = null;

  /**
   * Register the daily background backup task with Android OS & Expo TaskManager
   */
  static async registerDailyTask(): Promise<{ success: boolean; status?: string; message: string }> {
    if (Platform.OS === 'web' || !TaskManager || !BackgroundFetch || !isBackgroundTaskSupported) {
      return {
        success: false,
        message: 'Background fetch is unavailable in this environment (active in Android production build).',
      };
    }

    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(HISAB_MONEY_DAILY_BACKUP_TASK).catch(() => false);
      if (isRegistered) {
        this.registered = true;
        return {
          success: true,
          status: 'REGISTERED',
          message: 'Daily background backup task is active (runs approximately every 24h when device is idle).',
        };
      }

      await BackgroundFetch.registerTaskAsync(HISAB_MONEY_DAILY_BACKUP_TASK, {
        minimumInterval: 24 * 60 * 60, // 24 hours in seconds
        stopOnTerminate: false,
        startOnBoot: true,
      });

      this.registered = true;
      console.log('[DailyBackup] Daily background task registered successfully.');

      return {
        success: true,
        status: 'REGISTERED',
        message: 'Daily background backup task registered successfully.',
      };
    } catch (err: any) {
      console.warn('[DailyBackup] Registration error:', err);
      return {
        success: false,
        message: err?.message || 'Failed to register background backup task.',
      };
    }
  }

  /**
   * Foreground fallback:
   * Whenever app returns to foreground or launches, verify if 24 hours have elapsed
   * since the last successful backup. If so, attempt a backup automatically.
   */
  static initForegroundMonitor(): void {
    if (this.appStateSubscription) return;

    try {
      // Non-blocking deferred check on launch so app UI is completely smooth
      setTimeout(() => {
        this.checkIfDailyBackupDue().catch(() => {});
      }, 5000);

      this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
        if (nextState === 'active') {
          setTimeout(() => {
            this.checkIfDailyBackupDue().catch(() => {});
            try {
              const { BackupQueueService } = require('./backupQueueService');
              BackupQueueService.resumePendingWork();
            } catch {}
          }, 3000);
        }
      });
    } catch (e) {
      console.warn('[DailyBackup] initForegroundMonitor error:', e);
    }
  }

  /**
   * Checks if > 24 hours elapsed since last backup and triggers if due
   */
  static async checkIfDailyBackupDue(): Promise<boolean> {
    try {
      const { BackupQueueService } = require('./backupQueueService');
      const lastBackupIso = await BackupQueueService.getLastBackupTime();
      if (!lastBackupIso) {
        // No backup ever created; queue initial backup
        BackupQueueService.triggerAutoBackup('daily_first_run');
        return true;
      }

      const lastDate = new Date(lastBackupIso).getTime();
      const now = Date.now();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;

      if (now - lastDate >= twentyFourHoursMs) {
        console.log('[DailyBackup] >24 hours since last backup. Triggering daily backup attempt...');
        BackupQueueService.triggerAutoBackup('daily_interval_due');
        return true;
      }

      return false;
    } catch (e) {
      console.warn('[DailyBackup] Daily check warning:', e);
      return false;
    }
  }

  /**
   * Check status of the background task
   */
  static async getTaskStatus(): Promise<{ isRegistered: boolean; statusDesc: string }> {
    if (!TaskManager || !BackgroundFetch || !isBackgroundTaskSupported || Platform.OS === 'web') {
      return {
        isRegistered: false,
        statusDesc: 'Runs automatically on app launch/resume (Native background fetch active on Android)',
      };
    }

    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(HISAB_MONEY_DAILY_BACKUP_TASK);
      return {
        isRegistered,
        statusDesc: isRegistered
          ? 'Active (best-effort daily attempt when device is idle and connected)'
          : 'Standby (monitored on app launch & foreground)',
      };
    } catch {
      return {
        isRegistered: false,
        statusDesc: 'Monitored on app launch & resume',
      };
    }
  }
}

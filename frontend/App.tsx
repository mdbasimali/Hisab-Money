import './global.css';
import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import './src/i18n';
import { initializeLanguage } from './src/i18n';
import { AppNavigator } from './src/navigation/AppNavigator';
import { ThemeProvider, useAppTheme } from './src/context/ThemeContext';

function MainApp() {
  const { isDark } = useAppTheme();

  useEffect(() => {
    // 1. Initialize language preference (lightweight SQLite read)
    try {
      initializeLanguage();
    } catch (e) {
      console.warn('[App] Language init warning:', e);
    }

    // 2. Defer all non-critical background services until AFTER UI renders and initial screen is interactive
    const timer = setTimeout(() => {
      try {
        // Initialize background sync worker & lifecycle listeners
        const { SyncService } = require('./src/services/syncService');
        SyncService.init();
      } catch (e) {
        console.warn('[App] SyncService init warning:', e);
      }

      try {
        // Initialize always-on backup queue & resume any pending snapshots
        const { BackupQueueService } = require('./src/services/backupQueueService');
        BackupQueueService.init();
      } catch (e) {
        console.warn('[App] BackupQueueService init warning:', e);
      }

      try {
        // Initialize daily background backup task & foreground monitor
        const { DailyBackupService } = require('./src/services/dailyBackupService');
        DailyBackupService.initForegroundMonitor();
        DailyBackupService.registerDailyTask();
      } catch (e) {
        console.warn('[App] DailyBackupService init warning:', e);
      }

      try {
        // Initialize notification channels for backup status
        const { NotificationService } = require('./src/services/notificationService');
        NotificationService.initNotificationChannel();
      } catch (e) {
        console.warn('[App] NotificationService init warning:', e);
      }
    }, 1200);

    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppNavigator />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <MainApp />
    </ThemeProvider>
  );
}


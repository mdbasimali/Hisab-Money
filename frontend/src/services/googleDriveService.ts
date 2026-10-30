import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { BackupService, BackupSnapshot } from './backupService';
import { AuthService } from './authService';

let GoogleSignin: any = null;
try {
  const RNSignIn = require('@react-native-google-signin/google-signin');
  GoogleSignin = RNSignIn.GoogleSignin;
} catch (e) {
  // Expo Go or unlinked environment
}

export const DRIVE_FILE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
export const HISAB_MONEY_FOLDER_NAME = 'Hisab Money';
export const PAISA_KHATA_FOLDER_NAME = 'Paisa Khata';
const DRIVE_FOLDER_ID_KEY = 'paisa_khata_drive_folder_id';
const DRIVE_JSON_FILE_ID_KEY = 'paisa_khata_backup_json_file_id';
const DRIVE_PDF_FILE_ID_KEY = 'paisa_khata_backup_pdf_file_id';
const DRIVE_AUTHORIZED_KEY = 'hisab_money_drive_authorized';
const LAST_SUCCESSFUL_BACKUP_TIME_KEY = 'hisab_money_last_backup_time';
const FIRST_DRIVE_PROMPT_KEY = 'hisab_money_first_drive_prompt_handled';

export const HISAB_MONEY_BACKUP_FILENAME = 'Hisab_Money_Backup.json';
export const PAISA_KHATA_BACKUP_FILENAME = 'Paisa_Khata_Backup.json';
export const HISAB_MONEY_REPORT_FILENAME = 'Hisab_Money_Report.pdf';
export const PAISA_KHATA_REPORT_FILENAME = 'Paisa_Khata_Report.pdf';

export interface DriveBackupMeta {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime?: string;
  size?: string;
  parents?: string[];
}

export class GoogleDriveBackupService {
  private static cachedFolderId: string | null = null;
  private static cachedJsonFileId: string | null = null;
  private static cachedPdfFileId: string | null = null;
  private static isUploading: boolean = false;

  /**
   * Status indicator for Drive Integration
   */
  static isDriveAvailable(): boolean {
    return !!GoogleSignin;
  }

  /**
   * Get cached folder ID from SecureStore / memory
   */
  static async getStoredFolderId(): Promise<string | null> {
    if (this.cachedFolderId) return this.cachedFolderId;
    try {
      if (Platform.OS === 'web') {
        this.cachedFolderId = localStorage.getItem(DRIVE_FOLDER_ID_KEY);
      } else {
        this.cachedFolderId = await SecureStore.getItemAsync(DRIVE_FOLDER_ID_KEY);
      }
      return this.cachedFolderId;
    } catch {
      return null;
    }
  }

  /**
   * Store folder ID in SecureStore and memory
   */
  static async setStoredFolderId(folderId: string | null): Promise<void> {
    this.cachedFolderId = folderId;
    try {
      if (!folderId) {
        if (Platform.OS === 'web') {
          localStorage.removeItem(DRIVE_FOLDER_ID_KEY);
        } else {
          await SecureStore.deleteItemAsync(DRIVE_FOLDER_ID_KEY);
        }
      } else {
        if (Platform.OS === 'web') {
          localStorage.setItem(DRIVE_FOLDER_ID_KEY, folderId);
        } else {
          await SecureStore.setItemAsync(DRIVE_FOLDER_ID_KEY, folderId);
        }
      }
    } catch (e) {
      console.warn('[GoogleDrive] Failed to persist folder ID:', e);
    }
  }

  /**
   * Stored File ID helpers for single backup and report files
   */
  static async getStoredJsonFileId(): Promise<string | null> {
    if (this.cachedJsonFileId) return this.cachedJsonFileId;
    try {
      if (Platform.OS === 'web') {
        this.cachedJsonFileId = localStorage.getItem(DRIVE_JSON_FILE_ID_KEY);
      } else {
        this.cachedJsonFileId = await SecureStore.getItemAsync(DRIVE_JSON_FILE_ID_KEY);
      }
      return this.cachedJsonFileId;
    } catch {
      return null;
    }
  }

  static async setStoredJsonFileId(fileId: string | null): Promise<void> {
    this.cachedJsonFileId = fileId;
    try {
      if (!fileId) {
        if (Platform.OS === 'web') {
          localStorage.removeItem(DRIVE_JSON_FILE_ID_KEY);
        } else {
          await SecureStore.deleteItemAsync(DRIVE_JSON_FILE_ID_KEY);
        }
      } else {
        if (Platform.OS === 'web') {
          localStorage.setItem(DRIVE_JSON_FILE_ID_KEY, fileId);
        } else {
          await SecureStore.setItemAsync(DRIVE_JSON_FILE_ID_KEY, fileId);
        }
      }
    } catch (e) {
      console.warn('[GoogleDrive] Failed to persist JSON file ID:', e);
    }
  }

  static async getStoredPdfFileId(): Promise<string | null> {
    if (this.cachedPdfFileId) return this.cachedPdfFileId;
    try {
      if (Platform.OS === 'web') {
        this.cachedPdfFileId = localStorage.getItem(DRIVE_PDF_FILE_ID_KEY);
      } else {
        this.cachedPdfFileId = await SecureStore.getItemAsync(DRIVE_PDF_FILE_ID_KEY);
      }
      return this.cachedPdfFileId;
    } catch {
      return null;
    }
  }

  static async setStoredPdfFileId(fileId: string | null): Promise<void> {
    this.cachedPdfFileId = fileId;
    try {
      if (!fileId) {
        if (Platform.OS === 'web') {
          localStorage.removeItem(DRIVE_PDF_FILE_ID_KEY);
        } else {
          await SecureStore.deleteItemAsync(DRIVE_PDF_FILE_ID_KEY);
        }
      } else {
        if (Platform.OS === 'web') {
          localStorage.setItem(DRIVE_PDF_FILE_ID_KEY, fileId);
        } else {
          await SecureStore.setItemAsync(DRIVE_PDF_FILE_ID_KEY, fileId);
        }
      }
    } catch (e) {
      console.warn('[GoogleDrive] Failed to persist PDF file ID:', e);
    }
  }

  /**
   * Finds or creates the 'Hisab Money' folder in the user's Google Drive.
   * Backwards compatible: checks for existing 'Hisab Money' or legacy 'Paisa Khata' folder.
   * Prevents creating duplicate folders by checking existence first.
   */
  /**
   * Helper: Finds existing file by name anywhere in Google Drive (across all folders)
   */
  static async findFileGlobally(
    accessToken: string,
    filename: string
  ): Promise<{ id: string; parentFolderId?: string } | null> {
    try {
      const query = encodeURIComponent(`name = '${filename}' and trashed = false`);
      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name,parents,modifiedTime)&orderBy=modifiedTime desc`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          const match = data.files[0];
          return {
            id: match.id,
            parentFolderId: match.parents && match.parents.length > 0 ? match.parents[0] : undefined,
          };
        }
      }
      return null;
    } catch (e) {
      console.warn(`[GoogleDrive] Global file search notice for '${filename}':`, e);
      return null;
    }
  }

  /**
   * Helper: Finds existing file by name in the target parent folder.
   */
  static async findFileInFolder(
    accessToken: string,
    filename: string,
    parentFolderId: string
  ): Promise<string | null> {
    try {
      const isAppData = parentFolderId === 'appDataFolder';
      const parentFilter = isAppData ? "'appDataFolder' in parents" : `'${parentFolderId}' in parents`;
      const query = encodeURIComponent(`name = '${filename}' and ${parentFilter} and trashed = false`);
      const spacesParam = isAppData ? 'spaces=appDataFolder' : 'spaces=drive';

      const url = `https://www.googleapis.com/drive/v3/files?q=${query}&${spacesParam}&fields=files(id,name,trashed)&orderBy=modifiedTime desc,createdTime asc`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        const data = await res.json();
        if (data.files && data.files.length > 0) {
          return data.files[0].id;
        }
      }
      return null;
    } catch (e) {
      console.warn(`[GoogleDrive] Error finding file '${filename}':`, e);
      return null;
    }
  }

  /**
   * Finds or creates the 'Hisab Money' folder in the user's Google Drive.
   * Backwards compatible: checks for existing 'Hisab Money' or legacy 'Paisa Khata' folder.
   * CRITICAL: Strictly prevents creating duplicate folders by:
   * 1. Reusing verified storedFolderId if valid.
   * 2. Searching if backup file already exists on Drive and adopting its parent folder.
   * 3. Searching for any existing folder by name before creating a new one.
   */
  static async getOrCreateHisabMoneyFolder(accessToken: string): Promise<{ success: boolean; folderId?: string; message?: string }> {
    try {
      // 1. Check if we already have a saved folder ID and verify it still exists
      const savedFolderId = await this.getStoredFolderId();
      if (savedFolderId) {
        const verifyRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${savedFolderId}?fields=id,name,mimeType,trashed`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (verifyRes.ok) {
          const verifyData = await verifyRes.json();
          if (verifyData && !verifyData.trashed && verifyData.mimeType === 'application/vnd.google-apps.folder') {
            console.log('[GoogleDrive] Reusing verified saved folder:', savedFolderId);
            return { success: true, folderId: savedFolderId };
          }
        }
        // If saved folder was trashed or not found, clear stale cache
        await this.setStoredFolderId(null);
      }

      // 2. Check if a backup file already exists anywhere in Drive and adopt its parent folder!
      // This guarantees we connect to the exact folder that already has the user's data.
      const backupSearchNames = [HISAB_MONEY_BACKUP_FILENAME, PAISA_KHATA_BACKUP_FILENAME];
      for (const bName of backupSearchNames) {
        const existingBackup = await this.findFileGlobally(accessToken, bName);
        if (existingBackup?.parentFolderId) {
          const verifyParent = await fetch(
            `https://www.googleapis.com/drive/v3/files/${existingBackup.parentFolderId}?fields=id,name,mimeType,trashed`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (verifyParent.ok) {
            const pData = await verifyParent.json();
            if (pData && !pData.trashed && pData.mimeType === 'application/vnd.google-apps.folder') {
              console.log('[GoogleDrive] Discovered folder containing existing backup file:', existingBackup.parentFolderId);
              await this.setStoredFolderId(existingBackup.parentFolderId);
              await this.setStoredJsonFileId(existingBackup.id);
              return { success: true, folderId: existingBackup.parentFolderId };
            }
          }
        }
      }

      // 3. Search if 'Hisab Money' or 'Paisa Khata' folder already exists in Drive
      // Query clean queries without complex parenthesis to avoid 400 bad requests
      const folderNames = [HISAB_MONEY_FOLDER_NAME, PAISA_KHATA_FOLDER_NAME];
      for (const fName of folderNames) {
        const query = encodeURIComponent(
          `mimeType = 'application/vnd.google-apps.folder' and name = '${fName}' and trashed = false`
        );
        const searchRes = await fetch(
          `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name,createdTime,mimeType)&orderBy=createdTime asc`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.files && searchData.files.length > 0) {
            // Pick established folder (createdTime asc)
            const existingFolderId = searchData.files[0].id;
            console.log(`[GoogleDrive] Reusing existing '${fName}' folder in Drive:`, existingFolderId);
            await this.setStoredFolderId(existingFolderId);
            return { success: true, folderId: existingFolderId };
          }
        } else {
          const errText = await searchRes.text();
          console.warn(`[GoogleDrive] Folder search query for '${fName}' status ${searchRes.status}:`, errText);
        }
      }

      // 4. Create ONE 'Hisab Money' folder ONLY if no folder exists anywhere
      console.log('[GoogleDrive] No existing folder found. Creating Hisab Money folder...');
      const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: HISAB_MONEY_FOLDER_NAME,
          mimeType: 'application/vnd.google-apps.folder',
        }),
      });

      if (!createRes.ok) {
        const errText = await createRes.text();
        return {
          success: false,
          message: `Failed to create '${HISAB_MONEY_FOLDER_NAME}' folder: ${createRes.status} ${errText}`,
        };
      }

      const createdFolder = await createRes.json();
      await this.setStoredFolderId(createdFolder.id);
      console.log('[GoogleDrive] Created Hisab Money folder with ID:', createdFolder.id);
      return { success: true, folderId: createdFolder.id };
    } catch (err: any) {
      console.warn('[GoogleDrive] Folder search/creation error:', err);
      return { success: false, message: err?.message || 'Error configuring Hisab Money Drive folder' };
    }
  }

  // Alias for backward compatibility
  static async getOrCreatePaisaKhataFolder(accessToken: string): Promise<{ success: boolean; folderId?: string; message?: string }> {
    return this.getOrCreateHisabMoneyFolder(accessToken);
  }

  /**
   * Uploads or updates a file in Google Drive (WhatsApp-style single file per backup).
   * If existingFileId is valid, performs files.update (PATCH).
   * Otherwise, checks if file already exists in folder before creating (POST).
   */
  static async uploadOrUpdateFile(
    accessToken: string,
    filename: string,
    mimeType: string,
    content: string,
    targetParents: string[],
    storedFileId: string | null
  ): Promise<{ success: boolean; fileId?: string; isUpdated: boolean; error?: string }> {
    const boundary = 'foo_bar_baz_paisa_khata';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelim = `\r\n--${boundary}--`;

    let activeFileId = storedFileId;

    // Verify storedFileId exists and is not trashed
    if (activeFileId) {
      const checkRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${activeFileId}?fields=id,trashed`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!checkRes.ok) {
        activeFileId = null;
      } else {
        const checkData = await checkRes.json();
        if (checkData.trashed) activeFileId = null;
      }
    }

    // If no valid storedFileId, search by name in the target folder to prevent duplicates
    if (!activeFileId && targetParents.length > 0) {
      activeFileId = await this.findFileInFolder(accessToken, filename, targetParents[0]);
    }

    const metadata = {
      name: filename,
      mimeType,
      ...(activeFileId ? {} : { parents: targetParents }),
    };

    const multipartRequestBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n` +
      content +
      closeDelim;

    if (activeFileId) {
      // 1. UPDATE existing file (files.update via PATCH)
      console.log(`[GoogleDrive] Updating existing ${filename} (ID: ${activeFileId})...`);
      const updateUrl = `https://www.googleapis.com/upload/drive/v3/files/${activeFileId}?uploadType=multipart`;
      const updateRes = await fetch(updateUrl, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartRequestBody,
      });

      if (updateRes.ok) {
        const updateData = await updateRes.json();
        return { success: true, fileId: updateData.id, isUpdated: true };
      }
      console.warn(`[GoogleDrive] Update failed (${updateRes.status}), falling back to create...`);
    }

    // 2. CREATE new file (files.create via POST)
    console.log(`[GoogleDrive] Creating new ${filename}...`);
    const createUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      return { success: false, error: `${createRes.status} ${errText}`, isUpdated: false };
    }

    const createData = await createRes.json();
    return { success: true, fileId: createData.id, isUpdated: false };
  }

  /**
   * Explicitly requests Google Drive OAuth authorization.
   * Requests both drive.file and drive.appdata scopes.
   * Automatically initializes the 'Paisa Khata' folder upon connection.
   */
  static async connectGoogleDrive(): Promise<{ success: boolean; message: string; folderId?: string }> {
    if (!GoogleSignin) {
      return {
        success: false,
        message: 'Google Sign-In is unavailable on this device.',
      };
    }

    try {
      const isAuth = await AuthService.isAuthenticated();
      if (!isAuth) {
        return {
          success: false,
          message: 'Please log in with Google first before connecting Google Drive.',
        };
      }

      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

      // Request standard drive.file scope via native Google Play Services
      // Using only DRIVE_FILE_SCOPE avoids restricted scope verification blocks
      if (typeof GoogleSignin.addScopes === 'function') {
        await GoogleSignin.addScopes({
          scopes: [DRIVE_FILE_SCOPE],
        });
      } else {
        GoogleSignin.configure({
          webClientId:
            process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ||
            '439116612452-oqhlfsp47m53i2gercoq340q789gfdkc.apps.googleusercontent.com',
          scopes: [DRIVE_FILE_SCOPE],
          offlineAccess: false,
        });
        await GoogleSignin.signInSilently();
      }

      // Verify connection by fetching fresh tokens
      const tokens = await GoogleSignin.getTokens();
      if (!tokens?.accessToken) {
        return {
          success: false,
          message: 'Authorization completed, but could not retrieve Google Drive access token.',
        };
      }

      // Automatically find or create the 'Hisab Money' folder in Drive
      const folderRes = await this.getOrCreateHisabMoneyFolder(tokens.accessToken);
      if (folderRes.success && folderRes.folderId) {
        await this.setDriveAuthorizedState(true);
        return {
          success: true,
          folderId: folderRes.folderId,
          message: "Google Drive connected! 'Hisab Money' folder ready for automatic cloud backups.",
        };
      } else {
        // Strictly mark disconnected if verification failed
        await this.setDriveAuthorizedState(false);
        if (folderRes.message?.includes('401') || folderRes.message?.includes('403')) {
          return {
            success: false,
            message: 'Drive scope was not granted or permissions were denied by Google Account.',
          };
        }
        return {
          success: false,
          message: folderRes.message || 'Google Drive connected, but verifying backup folder failed.',
        };
      }
    } catch (err: any) {
      await this.setDriveAuthorizedState(false);
      console.warn('[GoogleDrive] Connect error:', err);
      if (err.code === 'SIGN_IN_CANCELLED' || err.code === '12501' || err?.message?.includes('cancel')) {
        return { success: false, message: 'Google Drive connection was cancelled by user.' };
      }
      if (err?.message?.includes('blocked') || err?.message?.includes('access_denied') || err?.code === '12500') {
        return {
          success: false,
          message: 'Google OAuth access is blocked. Please ensure your Gmail address is added to "Test users" in Google Cloud Console > OAuth consent screen.',
        };
      }
      return {
        success: false,
        message: err?.message || 'Failed to authorize Google Drive access.',
      };
    }
  }

  /**
   * Persistently stores Drive authorization state.
   * Differentiates basic Google sign-in from granted Drive permissions.
   */
  static async getDriveAuthorizedState(): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(DRIVE_AUTHORIZED_KEY) === 'true';
      }
      const val = await SecureStore.getItemAsync(DRIVE_AUTHORIZED_KEY);
      return val === 'true';
    } catch {
      return false;
    }
  }

  static async setDriveAuthorizedState(authorized: boolean): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (authorized) {
          localStorage.setItem(DRIVE_AUTHORIZED_KEY, 'true');
        } else {
          localStorage.removeItem(DRIVE_AUTHORIZED_KEY);
        }
      } else {
        if (authorized) {
          await SecureStore.setItemAsync(DRIVE_AUTHORIZED_KEY, 'true');
        } else {
          await SecureStore.deleteItemAsync(DRIVE_AUTHORIZED_KEY);
        }
      }
    } catch (e) {
      console.warn('[GoogleDrive] setDriveAuthorizedState error:', e);
    }
  }

  static async getLastBackupTime(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(LAST_SUCCESSFUL_BACKUP_TIME_KEY);
      }
      return await SecureStore.getItemAsync(LAST_SUCCESSFUL_BACKUP_TIME_KEY);
    } catch {
      return null;
    }
  }

  static async setLastBackupTime(timeIso: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        localStorage.setItem(LAST_SUCCESSFUL_BACKUP_TIME_KEY, timeIso);
      } else {
        await SecureStore.setItemAsync(LAST_SUCCESSFUL_BACKUP_TIME_KEY, timeIso);
      }
    } catch (e) {
      console.warn('[GoogleDrive] setLastBackupTime error:', e);
    }
  }

  /**
   * Checks whether Google Drive authorization is currently valid and active.
   * FIX: Strictly distinguishes basic Google login from Drive authorization.
   * On first Google login, Drive is NOT connected until explicit Drive authorization succeeds.
   */
  static async isDriveConnected(verifyWithApi: boolean = false): Promise<boolean> {
    if (!GoogleSignin) return false;
    try {
      const isAuth = await AuthService.isAuthenticated();
      if (!isAuth) return false;

      // Must have explicitly completed Google Drive connection
      const isAuthorized = await this.getDriveAuthorizedState();
      if (!isAuthorized) {
        return false;
      }

      const tokens = await GoogleSignin.getTokens().catch(() => null);
      if (!tokens?.accessToken) {
        return false;
      }

      // If deep verification is requested or to detect revoked access
      if (verifyWithApi) {
        try {
          const verifyRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
          });
          if (verifyRes.status === 401 || verifyRes.status === 403) {
            // Token expired or Drive permission was revoked by user in Google Account
            await this.setDriveAuthorizedState(false);
            return false;
          }
          return verifyRes.ok;
        } catch {
          // If offline / network error during verify, return true if authorized flag is set
          return true;
        }
      }

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Disconnects / revokes Drive authorization locally and resets cached folder ID
   */
  static async disconnectGoogleDrive(): Promise<void> {
    await this.setDriveAuthorizedState(false);
    await this.setStoredFolderId(null);
    await this.setStoredJsonFileId(null);
    await this.setStoredPdfFileId(null);
    if (!GoogleSignin) return;
    try {
      GoogleSignin.configure({
        webClientId:
          process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB ||
          '439116612452-oqhlfsp47m53i2gercoq340q789gfdkc.apps.googleusercontent.com',
        offlineAccess: false,
      });
    } catch (e) {
      console.warn('[GoogleDrive] Disconnect warning:', e);
    }
  }

  /**
   * Reads persistent flag indicating whether the initial first-login Drive connection prompt has been handled
   */
  static async isFirstDrivePromptHandled(): Promise<boolean> {
    try {
      if (Platform.OS === 'web') {
        return localStorage.getItem(FIRST_DRIVE_PROMPT_KEY) === 'true';
      }
      const val = await SecureStore.getItemAsync(FIRST_DRIVE_PROMPT_KEY);
      return val === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Sets persistent flag so user is not prompted repeatedly on every app restart
   */
  static async setFirstDrivePromptHandled(handled: boolean): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (handled) localStorage.setItem(FIRST_DRIVE_PROMPT_KEY, 'true');
        else localStorage.removeItem(FIRST_DRIVE_PROMPT_KEY);
      } else {
        if (handled) await SecureStore.setItemAsync(FIRST_DRIVE_PROMPT_KEY, 'true');
        else await SecureStore.deleteItemAsync(FIRST_DRIVE_PROMPT_KEY);
      }
    } catch (e) {
      console.warn('[GoogleDrive] setFirstDrivePromptHandled error:', e);
    }
  }

  /**
   * First-login automated flow:
   * 1. Connects & verifies real Google Drive authorization with drive.file scope.
   * 2. Checks if local records and cloud backups exist.
   * 3. Prevents overwriting valid cloud backups with empty databases.
   * 4. Returns detailed state for reconciliation or restore.
   */
  static async handleFirstLoginDriveSetup(): Promise<{
    connected: boolean;
    restored?: boolean;
    backedUp?: boolean;
    message: string;
    hasConflict?: boolean;
    localCount?: number;
    remoteCount?: number;
    remoteFileId?: string;
    remoteSnapshot?: BackupSnapshot;
  }> {
    await this.setFirstDrivePromptHandled(true);
    const connectRes = await this.connectGoogleDrive();
    if (!connectRes.success) {
      return {
        connected: false,
        message: connectRes.message,
      };
    }

    try {
      // 1. Inspect local records
      const { BackupService } = require('./backupService');
      const localSnapshot = await BackupService.createLocalSnapshot();
      const localCount = localSnapshot.customersCount || 0;

      // 2. Inspect cloud records
      const listRes = await this.listBackupsFromDrive();
      let remoteSnapshot: BackupSnapshot | null = null;
      let remoteFileId: string | null = null;

      for (const candidate of (listRes.backups || []).filter((f: DriveBackupMeta) => f.name.endsWith('.json'))) {
        const check = await this.fetchBackupContent(candidate.id);
        if (check.success && check.snapshot && check.snapshot.customersCount > 0) {
          remoteSnapshot = check.snapshot;
          remoteFileId = candidate.id;
          break;
        }
      }

      // Scenario A: Existing cloud backup found, local DB is empty -> candidate for restore
      if (localCount === 0 && remoteSnapshot && remoteSnapshot.customersCount > 0 && remoteFileId) {
        return {
          connected: true,
          hasConflict: false,
          localCount: 0,
          remoteCount: remoteSnapshot.customersCount,
          remoteFileId,
          remoteSnapshot,
          message: `Found existing cloud backup with ${remoteSnapshot.customersCount} customer records.`,
        };
      }

      // Scenario B: Both local records AND cloud backup exist -> conflict detection
      if (localCount > 0 && remoteSnapshot && remoteSnapshot.customersCount > 0 && remoteFileId) {
        return {
          connected: true,
          hasConflict: true,
          localCount,
          remoteCount: remoteSnapshot.customersCount,
          remoteFileId,
          remoteSnapshot,
          message: `Local ledger (${localCount} customers) and cloud backup (${remoteSnapshot.customersCount} customers) both exist.`,
        };
      }

      // Scenario C: Local records exist, no cloud backup -> start initial backup safely
      if (localCount > 0 && !remoteSnapshot) {
        const uploadRes = await this.uploadBackupToDrive();
        return {
          connected: true,
          backedUp: uploadRes.success,
          message: uploadRes.message,
        };
      }

      // Scenario D: Brand new user (0 local, 0 remote)
      return {
        connected: true,
        message: 'Google Drive connected successfully. Always-on cloud backup is active.',
      };
    } catch (e: any) {
      console.warn('[GoogleDrive] handleFirstLoginDriveSetup inspection warning:', e);
      return {
        connected: true,
        message: 'Google Drive connected successfully.',
      };
    }
  }

  /**
   * Retrieves genuine OAuth access token for Google Drive API operations
   */
  static async getDriveAccessToken(): Promise<string | null> {
    if (!GoogleSignin) {
      throw new Error('Google Sign-In native module not available. Native development build required.');
    }

    const isAuth = await AuthService.isAuthenticated();
    if (!isAuth) {
      throw new Error('User is not signed in with Google. Please sign in first.');
    }

    const tokens = await GoogleSignin.getTokens();
    return tokens.accessToken || null;
  }

  /**
   * WhatsApp-style Single Cloud Backup with real-time stage progress reporting:
   * Maintains exactly ONE main backup file ('Paisa_Khata_Backup.json') and ONE report ('Paisa_Khata_Report.pdf')
   * inside the 'Paisa Khata' Google Drive folder. Updates existing files in-place using files.update.
   */
  static async uploadBackupToDrive(
    onProgress?: (event: import('./backupService').UploadProgressEvent) => void
  ): Promise<{
    success: boolean;
    jsonFileId?: string;
    pdfFileId?: string;
    pdfUri?: string;
    isUpdated?: boolean;
    snapshot?: BackupSnapshot;
    message: string;
  }> {
    if (this.isUploading) {
      return {
        success: false,
        message: 'A backup upload is already in progress. Please wait a moment.',
      };
    }

    const isAuth = await AuthService.isAuthenticated();
    if (!isAuth) {
      onProgress?.({
        stage: 'FAILED',
        progressPercent: 0,
        stageLabel: 'Authentication required',
        details: 'Please sign in with Google to use cloud backup.',
      });
      return {
        success: false,
        message: 'Authentication required. Please sign in with Google to use cloud backup.',
      };
    }

    if (!GoogleSignin) {
      onProgress?.({
        stage: 'FAILED',
        progressPercent: 0,
        stageLabel: 'Cloud backup unavailable',
        details: 'Google Drive cloud backup is unavailable in this environment.',
      });
      return {
        success: false,
        message: 'Google Drive backup is unavailable in this environment.',
      };
    }

    this.isUploading = true;

    try {
      // ── Stage 1: PREPARING (Collecting local records & verifying Drive session) ──
      onProgress?.({
        stage: 'PREPARING',
        progressPercent: 15,
        stageLabel: 'Preparing backup...',
        details: 'Connecting to Google Drive and preparing backup...',
      });

      const accessToken = await this.getDriveAccessToken();
      if (!accessToken) {
        onProgress?.({
          stage: 'FAILED',
          progressPercent: 15,
          stageLabel: 'Sign-in required',
          details: 'Please sign in with Google to enable cloud backup.',
        });
        return { success: false, message: 'Please sign in with Google to enable cloud backup.' };
      }

      // Ensure 'Hisab Money' folder exists in Drive
      let targetParents: string[] = [];
      const folderRes = await this.getOrCreateHisabMoneyFolder(accessToken);
      if (folderRes.success && folderRes.folderId) {
        targetParents = [folderRes.folderId];
      } else {
        // Fallback to appDataFolder if root folder access is restricted
        targetParents = ['appDataFolder'];
      }

      // ── Stage 2: CREATING (Generating JSON snapshot from SQLite) ───────────
      onProgress?.({
        stage: 'CREATING',
        progressPercent: 35,
        stageLabel: 'Creating backup...',
        details: 'Generating and serializing latest ledger snapshot...',
      });

      const snapshot = await BackupService.createLocalSnapshot();
      const content = BackupService.serializeBackup(snapshot);

      // ── Stage 3: SECURING (Verifying data integrity & schema consistency) ───
      onProgress?.({
        stage: 'SECURING',
        progressPercent: 55,
        stageLabel: 'Securing backup...',
        details: 'Verifying data integrity and customer balances...',
        customersCount: snapshot.customersCount,
        duesCount: snapshot.duesCount,
        paymentsCount: snapshot.paymentsCount,
      });

      const validation = BackupService.validateBackup(content);
      if (!validation.valid) {
        onProgress?.({
          stage: 'FAILED',
          progressPercent: 55,
          stageLabel: 'Validation error',
          details: `Backup validation failed: ${validation.error}`,
          customersCount: snapshot.customersCount,
        });
        return { success: false, message: `Backup validation failed: ${validation.error}` };
      }

      // ── Stage 4: UPLOADING (Uploading or Updating single cloud backup file) ───
      onProgress?.({
        stage: 'UPLOADING',
        progressPercent: 75,
        stageLabel: 'Uploading to Google Drive...',
        details: 'Uploading single cloud backup file to Hisab Money folder...',
        customersCount: snapshot.customersCount,
        duesCount: snapshot.duesCount,
        paymentsCount: snapshot.paymentsCount,
      });

      let storedJsonId = await this.getStoredJsonFileId();
      if (!storedJsonId && targetParents.length > 0) {
        // Find existing Hisab Money backup or backward-compatible Paisa Khata backup
        storedJsonId =
          (await this.findFileInFolder(accessToken, HISAB_MONEY_BACKUP_FILENAME, targetParents[0])) ||
          (await this.findFileInFolder(accessToken, PAISA_KHATA_BACKUP_FILENAME, targetParents[0]));
      }
      if (!storedJsonId) {
        // Search globally across Drive to avoid creating duplicate backup files
        const globalHisab = await this.findFileGlobally(accessToken, HISAB_MONEY_BACKUP_FILENAME);
        if (globalHisab?.id) {
          storedJsonId = globalHisab.id;
        } else {
          const globalPaisa = await this.findFileGlobally(accessToken, PAISA_KHATA_BACKUP_FILENAME);
          if (globalPaisa?.id) storedJsonId = globalPaisa.id;
        }
      }

      // CRITICAL DATA PROTECTION GUARD:
      // If the local database is currently empty (0 customers), NEVER overwrite an existing cloud backup that has customer records!
      if (snapshot.customersCount === 0 && storedJsonId) {
        try {
          const remoteCheck = await this.fetchBackupContent(storedJsonId);
          if (remoteCheck.success && remoteCheck.snapshot && remoteCheck.snapshot.customersCount > 0) {
            console.warn('[GoogleDrive] Blocked overwrite of non-empty cloud backup by empty local database');
            onProgress?.({
              stage: 'FAILED',
              progressPercent: 75,
              stageLabel: 'Cloud backup contains records',
              details: `Cloud backup has ${remoteCheck.snapshot.customersCount} customers. Please restore your cloud backup first before backing up.`,
              customersCount: 0,
            });
            return {
              success: false,
              message: `Your Google Drive backup already contains ${remoteCheck.snapshot.customersCount} customer records. Please tap "Restore from Google Drive" to recover your ledger records before creating a new backup.`,
            };
          }
        } catch (e) {
          console.warn('[GoogleDrive] Remote safety check notice:', e);
        }
      }

      const jsonUploadResult = await this.uploadOrUpdateFile(
        accessToken,
        HISAB_MONEY_BACKUP_FILENAME,
        'application/json',
        content,
        targetParents,
        storedJsonId
      );

      if (!jsonUploadResult.success || !jsonUploadResult.fileId) {
        onProgress?.({
          stage: 'FAILED',
          progressPercent: 75,
          stageLabel: 'Upload error',
          details: `Google Drive upload failed: ${jsonUploadResult.error || 'Network request error'}`,
          customersCount: snapshot.customersCount,
        });
        return { success: false, message: `Google Drive backup failed: ${jsonUploadResult.error}` };
      }

      await this.setStoredJsonFileId(jsonUploadResult.fileId);

      // Upload or update PDF report alongside JSON
      let pdfFileId: string | undefined;
      let pdfLocalUri: string | undefined;

      try {
        const { PdfReportService } = require('./pdfReportService');
        const pdfResult = await PdfReportService.generateReportPdf(snapshot);
        pdfLocalUri = pdfResult.uri;

        if (pdfResult.base64) {
          const binaryPdf = atob(pdfResult.base64);
          let storedPdfId = await this.getStoredPdfFileId();
          if (!storedPdfId && targetParents.length > 0) {
            storedPdfId =
              (await this.findFileInFolder(accessToken, HISAB_MONEY_REPORT_FILENAME, targetParents[0])) ||
              (await this.findFileInFolder(accessToken, PAISA_KHATA_REPORT_FILENAME, targetParents[0]));
          }
          const pdfUploadResult = await this.uploadOrUpdateFile(
            accessToken,
            HISAB_MONEY_REPORT_FILENAME,
            'application/pdf',
            binaryPdf,
            targetParents,
            storedPdfId
          );

          if (pdfUploadResult.success && pdfUploadResult.fileId) {
            pdfFileId = pdfUploadResult.fileId;
            await this.setStoredPdfFileId(pdfUploadResult.fileId);
          }
        }
      } catch (pdfErr) {
        console.warn('[GoogleDrive] PDF report update warning:', pdfErr);
      }

      // ── Stage 5: FINALIZING (Verifying completion & refreshing metadata) ────
      onProgress?.({
        stage: 'FINALIZING',
        progressPercent: 95,
        stageLabel: 'Finalizing...',
        details: 'Verifying cloud storage and refreshing backup metadata...',
        customersCount: snapshot.customersCount,
        duesCount: snapshot.duesCount,
        paymentsCount: snapshot.paymentsCount,
      });

      const actionWord = jsonUploadResult.isUpdated ? 'updated' : 'created';
      const locationMsg = targetParents.includes('appDataFolder')
        ? 'Private App Storage'
        : "'Hisab Money' folder";

      // ── Stage 6: COMPLETED ────────────────────────────────────────────────
      onProgress?.({
        stage: 'COMPLETED',
        progressPercent: 100,
        stageLabel: 'Backup completed successfully',
        details: `Saved ${snapshot.customersCount} customers, ${snapshot.duesCount} dues, and ${snapshot.paymentsCount} payments.`,
        customersCount: snapshot.customersCount,
        duesCount: snapshot.duesCount,
        paymentsCount: snapshot.paymentsCount,
      });

      await this.setLastBackupTime(new Date().toISOString());

      return {
        success: true,
        jsonFileId: jsonUploadResult.fileId,
        pdfFileId,
        pdfUri: pdfLocalUri,
        isUpdated: jsonUploadResult.isUpdated,
        snapshot,
        message: `Backup ${actionWord} successfully in Google Drive ${locationMsg} (${snapshot.customersCount} customers).`,
      };
    } catch (err: any) {
      onProgress?.({
        stage: 'FAILED',
        progressPercent: 0,
        stageLabel: 'Upload error',
        details: err?.message || 'Google Drive backup failed',
      });
      return { success: false, message: err?.message || 'Google Drive backup failed' };
    } finally {
      this.isUploading = false;
    }
  }

  /**
   * Lists available backup files in the 'Paisa Khata' folder in Google Drive (with appDataFolder fallback)
   */
  static async listBackupsFromDrive(): Promise<{ success: boolean; backups: DriveBackupMeta[]; message?: string }> {
    if (!GoogleSignin) {
      return {
        success: false,
        backups: [],
        message: 'Google Drive access is unavailable in this environment.',
      };
    }

    try {
      const accessToken = await this.getDriveAccessToken();
      if (!accessToken) {
        return { success: false, backups: [], message: 'No Google Drive access token.' };
      }

      const allFiles: DriveBackupMeta[] = [];

      // 1. Direct global search across Drive for any official or legacy backup JSON files
      const globalQuery = encodeURIComponent(
        `(name = '${HISAB_MONEY_BACKUP_FILENAME}' or name = '${PAISA_KHATA_BACKUP_FILENAME}') and trashed = false`
      );
      const globalUrl = `https://www.googleapis.com/drive/v3/files?q=${globalQuery}&spaces=drive&orderBy=modifiedTime desc,createdTime desc&fields=files(id,name,createdTime,modifiedTime,size,parents)`;
      const globalRes = await fetch(globalUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (globalRes.ok) {
        const globalData = await globalRes.json();
        if (Array.isArray(globalData.files)) {
          allFiles.push(...globalData.files);
          // If we found backup files, adopt the parent folder of the latest backup
          if (globalData.files.length > 0 && globalData.files[0].parents && globalData.files[0].parents.length > 0) {
            await this.setStoredFolderId(globalData.files[0].parents[0]);
            await this.setStoredJsonFileId(globalData.files[0].id);
          }
        }
      }

      // 2. Also search inside 'Hisab Money' / 'Paisa Khata' folder if available
      const folderRes = await this.getOrCreateHisabMoneyFolder(accessToken);
      if (folderRes.success && folderRes.folderId) {
        const folderQuery = encodeURIComponent(`'${folderRes.folderId}' in parents and trashed = false`);
        const folderUrl = `https://www.googleapis.com/drive/v3/files?q=${folderQuery}&spaces=drive&orderBy=modifiedTime desc,createdTime desc&fields=files(id,name,createdTime,modifiedTime,size,parents)`;
        const res = await fetch(folderUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.files)) {
            for (const f of data.files) {
              if (!allFiles.some((existing) => existing.id === f.id)) {
                allFiles.push(f);
              }
            }
          }
        }
      }

      // 3. Also check appDataFolder for previous legacy backups
      const appDataQuery = encodeURIComponent("spaces = 'appDataFolder' and trashed = false");
      const appDataUrl = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${appDataQuery}&orderBy=modifiedTime desc,createdTime desc&fields=files(id,name,createdTime,modifiedTime,size)`;
      const appDataRes = await fetch(appDataUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (appDataRes.ok) {
        const appDataJson = await appDataRes.json();
        if (Array.isArray(appDataJson.files)) {
          for (const f of appDataJson.files) {
            if (!allFiles.some((existing) => existing.id === f.id)) {
              allFiles.push(f);
            }
          }
        }
      }

      // Sort newest modified first, prioritizing official Hisab Money file
      allFiles.sort((a, b) => {
        const isHisabA = a.name === HISAB_MONEY_BACKUP_FILENAME;
        const isHisabB = b.name === HISAB_MONEY_BACKUP_FILENAME;
        const timeB = new Date(b.modifiedTime || b.createdTime).getTime();
        const timeA = new Date(a.modifiedTime || a.createdTime).getTime();
        if (Math.abs(timeB - timeA) < 1000 && isHisabA !== isHisabB) {
          return isHisabB ? 1 : -1;
        }
        return timeB - timeA;
      });

      return { success: true, backups: allFiles };
    } catch (e: any) {
      return { success: false, backups: [], message: e.message || 'Failed to list Drive backups' };
    }
  }

  /**
   * Downloads raw text from Google Drive with up to 3 retry attempts for transient errors (429, 5xx, network drops)
   * Permanent authorization errors (401, 403) and 404 are not retried.
   */
  static async downloadFileWithRetry(
    fileId: string,
    accessToken: string,
    maxAttempts: number = 3,
    onAttempt?: (attempt: number, max: number, delayMs: number) => void
  ): Promise<{ success: boolean; data?: string; status?: number; error?: string; isPermanentAuthError?: boolean }> {
    let lastError = '';
    let lastStatus = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timeout = setTimeout(() => controller?.abort(), 20000); // 20s timeout per download attempt

        const response = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: controller?.signal,
          }
        );

        clearTimeout(timeout);
        lastStatus = response.status;

        // Permanent auth error: do not retry
        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            status: response.status,
            isPermanentAuthError: true,
            error: `Google Drive authorization denied (${response.status}). Please reconnect your Google Drive account.`,
          };
        }

        // File not found: do not retry
        if (response.status === 404) {
          return {
            success: false,
            status: 404,
            error: 'The requested backup file was not found on Google Drive.',
          };
        }

        // Transient / rate-limit / server error: retry if attempts remaining
        if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
          lastError = `Google Drive server busy or unavailable (${response.status})`;
          if (attempt < maxAttempts) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
            onAttempt?.(attempt, maxAttempts, delay);
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        if (!response.ok) {
          return {
            success: false,
            status: response.status,
            error: `Failed to download backup file from Google Drive (${response.status}).`,
          };
        }

        const text = await response.text();
        return { success: true, data: text, status: 200 };
      } catch (networkErr: any) {
        lastError =
          networkErr?.name === 'AbortError'
            ? 'Download timed out'
            : networkErr?.message || 'Network connection failed during download';

        if (attempt < maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 4000);
          onAttempt?.(attempt, maxAttempts, delay);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    return {
      success: false,
      status: lastStatus,
      error: `Failed to download backup after ${maxAttempts} attempts (${lastError}). Please check your internet connection and try again.`,
    };
  }

  /**
   * Fetches metadata and raw JSON for a file in Google Drive to inspect before restore
   */
  static async fetchBackupContent(fileId: string): Promise<{ success: boolean; snapshot?: BackupSnapshot; error?: string }> {
    try {
      const accessToken = await this.getDriveAccessToken();
      if (!accessToken) {
        return { success: false, error: 'Google Drive authorization token not available.' };
      }

      const downloadResult = await this.downloadFileWithRetry(fileId, accessToken, 3);
      if (!downloadResult.success || !downloadResult.data) {
        return {
          success: false,
          error: downloadResult.error || 'Failed to download backup file from Google Drive.',
        };
      }

      const validation = BackupService.validateBackup(downloadResult.data);
      if (!validation.valid || !validation.snapshot) {
        return { success: false, error: validation.error || 'Corrupt or invalid backup file.' };
      }

      return { success: true, snapshot: validation.snapshot };
    } catch (e: any) {
      return { success: false, error: e?.message || 'Failed to inspect backup file.' };
    }
  }

  /**
   * Downloads and restores a backup from Google Drive with real-time stage progress reporting
   */
  static async restoreBackupFromDrive(
    fileId: string,
    onProgress?: (event: import('./backupService').RestoreProgressEvent) => void
  ): Promise<{ success: boolean; message: string; diff?: any; result?: import('./backupService').RestoreResult }> {
    try {
      onProgress?.({
        stage: 'DOWNLOADING',
        progressPercent: 10,
        stageLabel: 'Downloading backup from Google Drive...',
      });

      const accessToken = await this.getDriveAccessToken();
      if (!accessToken) {
        onProgress?.({
          stage: 'FAILED',
          progressPercent: 10,
          stageLabel: 'Authorization error',
          details: 'Google Drive authorization token not available.',
        });
        return { success: false, message: 'Google Drive authorization token not available.' };
      }

      // Download with up to 3 attempts with exponential backoff on transient errors
      const downloadResult = await this.downloadFileWithRetry(
        fileId,
        accessToken,
        3,
        (attempt, max, delayMs) => {
          onProgress?.({
            stage: 'DOWNLOADING',
            progressPercent: 10 + attempt * 5,
            stageLabel: `Retrying download (attempt ${attempt + 1}/${max})...`,
            details: `Network busy. Retrying in ${Math.round(delayMs / 1000)}s...`,
          });
        }
      );

      if (!downloadResult.success || !downloadResult.data) {
        onProgress?.({
          stage: 'FAILED',
          progressPercent: 10,
          stageLabel: 'Download failed',
          details: downloadResult.error || 'Failed to download backup file from Google Drive.',
        });
        return {
          success: false,
          message: downloadResult.error || 'Failed to download backup file from Google Drive.',
        };
      }

      onProgress?.({
        stage: 'DOWNLOADING',
        progressPercent: 25,
        stageLabel: 'Download complete, parsing data...',
      });

      const rawJson = downloadResult.data;
      const validation = BackupService.validateBackup(rawJson);
      if (!validation.valid || !validation.snapshot) {
        onProgress?.({
          stage: 'FAILED',
          progressPercent: 30,
          stageLabel: 'Validation failed',
          details: validation.error || 'Corrupt or invalid backup file.',
        });
        return { success: false, message: validation.error || 'Corrupt or invalid backup file.' };
      }

      // Calculate diff to inspect incoming data
      const diff = await BackupService.calculateRestoreDiff(validation.snapshot);

      // Perform transaction restore with live progress updates
      const result = await BackupService.restoreSnapshot(validation.snapshot, onProgress);

      onProgress?.({
        stage: 'COMPLETED',
        progressPercent: 100,
        stageLabel: 'Restore completed successfully',
        details: result.message,
        totalCustomers: result.totalCustomersInBackup,
        processedCustomers: result.restoredCustomers,
        totalDues: result.totalDuesInBackup,
        processedDues: result.restoredDues,
        totalPayments: result.totalPaymentsInBackup,
        processedPayments: result.restoredPayments,
      });

      return {
        success: result.success,
        message:
          result.message ||
          `Restored ${result.restoredCustomers} new customers, ${result.restoredDues} dues, and ${result.restoredPayments} payments.`,
        diff,
        result,
      };
    } catch (e: any) {
      onProgress?.({
        stage: 'FAILED',
        progressPercent: 0,
        stageLabel: 'Restore operation failed',
        details: e?.message || 'Drive restore failed',
      });
      return { success: false, message: e.message || 'Drive restore failed' };
    }
  }
}


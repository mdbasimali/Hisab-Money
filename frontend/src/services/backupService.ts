import { getDatabase } from '../database/db';

export const BACKUP_SCHEMA_VERSION = 1;
export const BACKUP_APP_IDENTIFIER = 'hisab_khata_backup';

export interface BackupCustomer {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
  credit_limit: number;
  opening_balance_paise: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface BackupDue {
  id: string;
  customer_id: string;
  amount_paise: number;
  reason: string;
  transaction_date: string;
  notes: string | null;
  created_at: string;
}

export interface BackupPayment {
  id: string;
  customer_id: string;
  amount_paise: number;
  payment_method: string;
  payment_date: string;
  notes: string | null;
  created_at: string;
}

export interface BackupSnapshot {
  app: string;
  schemaVersion: number;
  createdAt: string;
  customersCount: number;
  duesCount: number;
  paymentsCount: number;
  data: {
    customers: BackupCustomer[];
    dues: BackupDue[];
    payments: BackupPayment[];
  };
}

export interface RestoreDiff {
  newCustomers: number;
  newDues: number;
  newPayments: number;
  existingCustomers: number;
  existingDues?: number;
  existingPayments?: number;
  localOnlyCustomers?: number;
  localOnlyDues?: number;
  localOnlyPayments?: number;
  newerLocalCustomers?: number;
  hasStaleRisk?: boolean;
  conflicts: string[];
}

export type RestoreStage =
  | 'DOWNLOADING'
  | 'VALIDATING'
  | 'RESTORING_CUSTOMERS'
  | 'RESTORING_TRANSACTIONS'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'FAILED';

export interface RestoreProgressEvent {
  stage: RestoreStage;
  progressPercent: number; // 0 to 100
  stageLabel: string;
  details?: string;
  totalCustomers?: number;
  processedCustomers?: number;
  totalDues?: number;
  processedDues?: number;
  totalPayments?: number;
  processedPayments?: number;
}

export type RestoreProgressCallback = (event: RestoreProgressEvent) => void;

export type UploadStage =
  | 'PREPARING'
  | 'CREATING'
  | 'SECURING'
  | 'UPLOADING'
  | 'FINALIZING'
  | 'COMPLETED'
  | 'FAILED';

export interface UploadProgressEvent {
  stage: UploadStage;
  progressPercent: number; // 0 to 100
  stageLabel: string;
  details?: string;
  customersCount?: number;
  duesCount?: number;
  paymentsCount?: number;
}

export type UploadProgressCallback = (event: UploadProgressEvent) => void;

export interface RestoreResult {
  success: boolean;
  restoredCustomers: number;
  restoredDues: number;
  restoredPayments: number;
  totalCustomersInBackup?: number;
  totalDuesInBackup?: number;
  totalPaymentsInBackup?: number;
  message?: string;
  error?: string;
}

export class BackupService {
  /**
   * 1. Creates a consistent, versioned snapshot of local SQLite records
   */
  static async createLocalSnapshot(): Promise<BackupSnapshot> {
    const db = await getDatabase();

    let userId: string | null = null;
    try {
      const { AuthService } = require('./authService');
      const user = await AuthService.getUser();
      if (user?.id) userId = user.id;
    } catch {}

    const userClause = userId ? '(user_id = ? OR user_id IS NULL)' : '1=1';
    const userParams = userId ? [userId] : [];

    const customers = await db.getAllAsync<BackupCustomer>(
      `SELECT id, name, phone, address, notes, credit_limit, opening_balance_paise, is_archived, created_at, updated_at
       FROM customers
       WHERE ${userClause} AND id NOT LIKE 'c-dev-user-1%'
       ORDER BY created_at ASC;`,
      userParams
    );

    const dues = await db.getAllAsync<BackupDue>(
      `SELECT id, customer_id, amount_paise, reason, transaction_date, notes, created_at
       FROM due_transactions
       WHERE ${userClause}
       ORDER BY transaction_date ASC;`,
      userParams
    );

    const payments = await db.getAllAsync<BackupPayment>(
      `SELECT id, customer_id, amount_paise, payment_method, payment_date, notes, created_at
       FROM payments
       WHERE ${userClause} AND id NOT LIKE 'p-dev-user-1%'
       ORDER BY payment_date ASC;`,
      userParams
    );

    return {
      app: BACKUP_APP_IDENTIFIER,
      schemaVersion: BACKUP_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      customersCount: customers.length,
      duesCount: dues.length,
      paymentsCount: payments.length,
      data: {
        customers,
        dues,
        payments,
      },
    };
  }

  /**
   * 2. Serializes snapshot to JSON string
   */
  static serializeBackup(snapshot: BackupSnapshot): string {
    return JSON.stringify(snapshot, null, 2);
  }

  /**
   * 3. Validates backup structure, amounts, IDs, and referential integrity
   */
  static validateBackup(rawJson: string | object): { valid: boolean; error?: string; snapshot?: BackupSnapshot } {
    try {
      const snapshot: BackupSnapshot = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;

      if (!snapshot || typeof snapshot !== 'object') {
        return { valid: false, error: 'Backup is not a valid JSON object' };
      }

      if (
        snapshot.app !== BACKUP_APP_IDENTIFIER &&
        snapshot.app !== 'paisa_khata_backup' &&
        snapshot.app !== 'hisab_money_backup'
      ) {
        return { valid: false, error: 'Backup file does not belong to Hisab Money' };
      }

      if (typeof snapshot.schemaVersion !== 'number' || snapshot.schemaVersion > BACKUP_SCHEMA_VERSION) {
        return { valid: false, error: `Unsupported backup schema version: ${snapshot.schemaVersion}` };
      }

      if (!snapshot.data || !Array.isArray(snapshot.data.customers) || !Array.isArray(snapshot.data.dues) || !Array.isArray(snapshot.data.payments)) {
        return { valid: false, error: 'Backup data is missing customers, dues, or payments tables' };
      }

      const customerIds = new Set<string>();

      // Validate customers
      for (const c of snapshot.data.customers) {
        if (!c.id || typeof c.id !== 'string') return { valid: false, error: 'Customer is missing a valid id' };
        if (!c.name || typeof c.name !== 'string') return { valid: false, error: `Customer ${c.id} missing name` };
        // Normalize opening balance safely
        if (typeof c.opening_balance_paise !== 'number' || isNaN(c.opening_balance_paise) || c.opening_balance_paise < 0) {
          c.opening_balance_paise = 0;
        }
        customerIds.add(c.id);
      }

      // Validate dues and foreign key referential integrity
      for (const d of snapshot.data.dues) {
        if (!d.id || typeof d.id !== 'string') return { valid: false, error: 'Due record is missing id' };
        if (!d.customer_id || !customerIds.has(d.customer_id)) {
          return { valid: false, error: `Due ${d.id} references non-existent customer ${d.customer_id}` };
        }
        if (typeof d.amount_paise !== 'number' || isNaN(d.amount_paise) || d.amount_paise <= 0) {
          return { valid: false, error: `Due ${d.id} has invalid amount ${d.amount_paise}` };
        }
      }

      // Validate payments and foreign key referential integrity
      for (const p of snapshot.data.payments) {
        if (!p.id || typeof p.id !== 'string') return { valid: false, error: 'Payment record is missing id' };
        if (!p.customer_id || !customerIds.has(p.customer_id)) {
          return { valid: false, error: `Payment ${p.id} references non-existent customer ${p.customer_id}` };
        }
        if (typeof p.amount_paise !== 'number' || isNaN(p.amount_paise) || p.amount_paise <= 0) {
          return { valid: false, error: `Payment ${p.id} has invalid amount ${p.amount_paise}` };
        }
      }

      return { valid: true, snapshot };
    } catch (e: any) {
      return { valid: false, error: `Invalid backup JSON: ${e.message}` };
    }
  }

  /**
   * 4. Inspects differences without modifying the database (Safe Dry-Run)
   */
  static async calculateRestoreDiff(snapshot: BackupSnapshot): Promise<RestoreDiff> {
    const db = await getDatabase();

    const existingCustomers = await db.getAllAsync<{ id: string; name?: string; updated_at?: string }>('SELECT id, name, updated_at FROM customers;');
    const existingDues = await db.getAllAsync<{ id: string }>('SELECT id FROM due_transactions;');
    const existingPayments = await db.getAllAsync<{ id: string }>('SELECT id FROM payments;');

    const existingCustMap = new Map(existingCustomers.map((c) => [c.id, c]));
    const existingDueSet = new Set(existingDues.map((d) => d.id));
    const existingPaySet = new Set(existingPayments.map((p) => p.id));

    let newCustomers = 0;
    let newDues = 0;
    let newPayments = 0;
    let matchedCustomers = 0;
    let matchedDues = 0;
    let matchedPayments = 0;
    let newerLocalCustomers = 0;
    const conflicts: string[] = [];

    const snapshotCustIds = new Set<string>();
    for (const c of snapshot.data.customers) {
      snapshotCustIds.add(c.id);
      const existing = existingCustMap.get(c.id);
      if (!existing) {
        newCustomers++;
      } else {
        matchedCustomers++;
        if (existing.updated_at && c.updated_at && new Date(existing.updated_at).getTime() > new Date(c.updated_at).getTime()) {
          newerLocalCustomers++;
          conflicts.push(`Customer "${existing.name || c.name}" has newer local edits.`);
        }
      }
    }

    const snapshotDueIds = new Set<string>();
    for (const d of snapshot.data.dues) {
      snapshotDueIds.add(d.id);
      if (!existingDueSet.has(d.id)) {
        newDues++;
      } else {
        matchedDues++;
      }
    }

    const snapshotPayIds = new Set<string>();
    for (const p of snapshot.data.payments) {
      snapshotPayIds.add(p.id);
      if (!existingPaySet.has(p.id)) {
        newPayments++;
      } else {
        matchedPayments++;
      }
    }

    const localOnlyCustomers = existingCustomers.filter((c) => !snapshotCustIds.has(c.id)).length;
    const localOnlyDues = existingDues.filter((d) => !snapshotDueIds.has(d.id)).length;
    const localOnlyPayments = existingPayments.filter((p) => !snapshotPayIds.has(p.id)).length;
    const hasStaleRisk = localOnlyDues > 0 || localOnlyPayments > 0 || newerLocalCustomers > 0;

    return {
      newCustomers,
      newDues,
      newPayments,
      existingCustomers: matchedCustomers,
      existingDues: matchedDues,
      existingPayments: matchedPayments,
      localOnlyCustomers,
      localOnlyDues,
      localOnlyPayments,
      newerLocalCustomers,
      hasStaleRisk,
      conflicts,
    };
  }

  /**
   * 5. Safely applies restore into SQLite inside an atomic transaction.
   * Preserves records and updates conflicting rows with the latest snapshot.
   */
  static async restoreSnapshot(
    snapshot: BackupSnapshot,
    onProgress?: RestoreProgressCallback
  ): Promise<RestoreResult> {
    onProgress?.({
      stage: 'VALIDATING',
      progressPercent: 30,
      stageLabel: 'Validating backup data integrity...',
    });

    const validation = this.validateBackup(snapshot);
    if (!validation.valid || !validation.snapshot) {
      onProgress?.({
        stage: 'FAILED',
        progressPercent: 30,
        stageLabel: 'Backup validation failed',
        details: validation.error || 'Invalid backup structure',
      });
      throw new Error(validation.error || 'Invalid backup structure');
    }

    // Multi-Device Stale Data Protection:
    // Create an automatic safety recovery snapshot of current local records before modifying SQLite
    try {
      await this.createSafetyRecoveryBackup();
    } catch (safetyErr) {
      console.warn('[BackupService] Pre-restore safety backup notice:', safetyErr);
    }

    const totalCustomers = snapshot.data.customers.length;
    const totalDues = snapshot.data.dues.length;
    const totalPayments = snapshot.data.payments.length;

    const db = await getDatabase();
    let restoredCustomers = 0;
    let restoredDues = 0;
    let restoredPayments = 0;
    let processedTotal = 0;

    let userId: string | null = null;
    try {
      const { AuthService } = require('./authService');
      const user = await AuthService.getUser();
      if (user?.id) userId = user.id;
    } catch {}

    onProgress?.({
      stage: 'RESTORING_CUSTOMERS',
      progressPercent: 35,
      stageLabel: `Restoring customers (0 / ${totalCustomers})...`,
      totalCustomers,
      processedCustomers: 0,
    });

    await db.withTransactionAsync(async () => {
      // 1. Upsert customers safely, preserving IDs and updating user_id to active user
      for (let i = 0; i < snapshot.data.customers.length; i++) {
        const c = snapshot.data.customers[i];
        const isArchived =
          c.is_archived === 1 ||
          (c as any).is_archived === true ||
          (c as any).isArchived === true
            ? 1
            : 0;
        const openingBalance = Math.max(0, Math.round(c.opening_balance_paise || 0));

        const result = await db.runAsync(
          `INSERT INTO customers (
             id, name, phone, address, notes, credit_limit, opening_balance_paise, is_archived, user_id, created_at, updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             name = CASE WHEN excluded.updated_at >= customers.updated_at OR customers.updated_at IS NULL THEN excluded.name ELSE customers.name END,
             phone = CASE WHEN excluded.updated_at >= customers.updated_at OR customers.updated_at IS NULL THEN COALESCE(excluded.phone, customers.phone) ELSE customers.phone END,
             address = CASE WHEN excluded.updated_at >= customers.updated_at OR customers.updated_at IS NULL THEN COALESCE(excluded.address, customers.address) ELSE customers.address END,
             notes = CASE WHEN excluded.updated_at >= customers.updated_at OR customers.updated_at IS NULL THEN COALESCE(excluded.notes, customers.notes) ELSE customers.notes END,
             credit_limit = CASE WHEN excluded.updated_at >= customers.updated_at OR customers.updated_at IS NULL THEN excluded.credit_limit ELSE customers.credit_limit END,
             opening_balance_paise = CASE WHEN excluded.updated_at >= customers.updated_at OR customers.updated_at IS NULL THEN excluded.opening_balance_paise ELSE customers.opening_balance_paise END,
             is_archived = CASE WHEN excluded.updated_at >= customers.updated_at OR customers.updated_at IS NULL THEN excluded.is_archived ELSE customers.is_archived END,
             user_id = COALESCE(?, excluded.user_id, customers.user_id),
             updated_at = CASE WHEN excluded.updated_at >= customers.updated_at OR customers.updated_at IS NULL THEN excluded.updated_at ELSE customers.updated_at END;`,
          [
            c.id,
            c.name,
            c.phone || null,
            c.address || null,
            c.notes || null,
            c.credit_limit || 5000,
            openingBalance,
            isArchived,
            userId,
            c.created_at,
            c.updated_at,
            userId,
          ]
        );
        if (result.changes > 0) restoredCustomers++;
        processedTotal++;

        if (i % 5 === 0 || i === snapshot.data.customers.length - 1) {
          const custPct = Math.round(35 + (25 * (i + 1)) / Math.max(1, totalCustomers));
          onProgress?.({
            stage: 'RESTORING_CUSTOMERS',
            progressPercent: custPct,
            stageLabel: `Restoring customers (${i + 1} / ${totalCustomers})...`,
            totalCustomers,
            processedCustomers: i + 1,
          });
        }
      }

      onProgress?.({
        stage: 'RESTORING_TRANSACTIONS',
        progressPercent: 65,
        stageLabel: `Restoring dues & payments (0 / ${totalDues + totalPayments})...`,
        totalDues,
        processedDues: 0,
        totalPayments,
        processedPayments: 0,
      });

      // 2. Upsert dues safely
      for (let i = 0; i < snapshot.data.dues.length; i++) {
        const d = snapshot.data.dues[i];
        const result = await db.runAsync(
          `INSERT INTO due_transactions (
             id, customer_id, amount_paise, reason, transaction_date, notes, user_id, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             amount_paise = excluded.amount_paise,
             reason = excluded.reason,
             transaction_date = excluded.transaction_date,
             notes = COALESCE(excluded.notes, due_transactions.notes),
             user_id = COALESCE(?, excluded.user_id, due_transactions.user_id);`,
          [
            d.id,
            d.customer_id,
            d.amount_paise,
            d.reason,
            d.transaction_date,
            d.notes || null,
            userId,
            d.created_at,
            userId,
          ]
        );
        if (result.changes > 0) restoredDues++;
        processedTotal++;
      }

      // 3. Upsert payments safely
      for (let i = 0; i < snapshot.data.payments.length; i++) {
        const p = snapshot.data.payments[i];
        const result = await db.runAsync(
          `INSERT INTO payments (
             id, customer_id, amount_paise, payment_method, payment_date, notes, user_id, created_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             amount_paise = excluded.amount_paise,
             payment_method = excluded.payment_method,
             payment_date = excluded.payment_date,
             notes = COALESCE(excluded.notes, payments.notes),
             user_id = COALESCE(?, excluded.user_id, payments.user_id);`,
          [
            p.id,
            p.customer_id,
            p.amount_paise,
            p.payment_method || 'cash',
            p.payment_date,
            p.notes || null,
            userId,
            p.created_at,
            userId,
          ]
        );
        if (result.changes > 0) restoredPayments++;
        processedTotal++;
      }
    });

    // Ensure all restored records are owned by active user so queries never hide them
    if (userId) {
      try {
        await db.runAsync('UPDATE customers SET user_id = ? WHERE user_id IS NULL OR user_id = "";', [userId]);
        await db.runAsync('UPDATE due_transactions SET user_id = ? WHERE user_id IS NULL OR user_id = "";', [userId]);
        await db.runAsync('UPDATE payments SET user_id = ? WHERE user_id IS NULL OR user_id = "";', [userId]);
      } catch (userClaimErr) {
        console.warn('[BackupService] userClaim notice:', userClaimErr);
      }
    }

    onProgress?.({
      stage: 'FINALIZING',
      progressPercent: 95,
      stageLabel: 'Finalizing restore and updating records...',
    });

    return {
      success: true,
      restoredCustomers,
      restoredDues,
      restoredPayments,
      totalCustomersInBackup: totalCustomers,
      totalDuesInBackup: totalDues,
      totalPaymentsInBackup: totalPayments,
      message: `Restored ${restoredCustomers} new customers, ${restoredDues} dues, and ${restoredPayments} payments.`,
    };
  }

  /**
   * Persists a local backup snapshot to SQLite app_settings
   */
  static async saveLocalBackup(snapshot: BackupSnapshot): Promise<void> {
    try {
      const db = await getDatabase();
      const serialized = this.serializeBackup(snapshot);
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('last_local_backup_snapshot', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [serialized, now]
      );
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('last_local_backup_time', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [snapshot.createdAt, now]
      );
    } catch (e) {
      console.warn('[BackupService] Failed to persist local backup to app_settings:', e);
    }
  }

  /**
   * Reads saved local backup snapshot if one exists
   */
  static async getLocalBackup(): Promise<BackupSnapshot | null> {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM app_settings WHERE key = 'last_local_backup_snapshot';`
      );
      if (!row?.value) return null;
      const res = this.validateBackup(row.value);
      return res.valid && res.snapshot ? res.snapshot : null;
    } catch {
      return null;
    }
  }

  /**
   * Creates a safety recovery backup before any destructive restore
   */
  static async createSafetyRecoveryBackup(): Promise<BackupSnapshot> {
    const current = await this.createLocalSnapshot();
    try {
      const db = await getDatabase();
      const serialized = this.serializeBackup(current);
      const now = new Date().toISOString();
      await db.runAsync(
        `INSERT INTO app_settings (key, value, updated_at) VALUES ('safety_recovery_snapshot', ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;`,
        [serialized, now]
      );
    } catch (err) {
      console.warn('[BackupService] Safety recovery snapshot warning:', err);
    }
    return current;
  }
}

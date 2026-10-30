import { AppState, AppStateStatus } from 'react-native';
import { getDatabase } from '../database/db';
import { ApiService } from './apiService';

export interface SyncQueueItem {
  id: string;
  entity_type: 'customer' | 'due' | 'payment';
  entity_id: string;
  operation: 'CREATE' | 'UPDATE';
  payload: string; // JSON string
  status: 'PENDING' | 'SYNCED' | 'FAILED';
  attempts: number;
  last_error?: string | null;
  created_at: string;
}

export type SyncListener = (event: {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncTime?: Date;
  lastError?: string;
}) => void;

export class SyncService {
  private static isSyncing = false;
  private static retryTimer: any = null;
  private static consecutiveFailures = 0;
  private static listeners: Set<SyncListener> = new Set();
  private static isInitialized = false;

  // Exponential backoff configuration
  private static readonly INITIAL_RETRY_DELAY_MS = 2000; // 2 seconds
  private static readonly MAX_RETRY_DELAY_MS = 60000; // 60 seconds max backoff

  /**
   * Register a listener for sync state changes (for UI status badges)
   */
  static addListener(listener: SyncListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private static notifyListeners(lastError?: string): void {
    this.getPendingCount().then((pendingCount) => {
      this.listeners.forEach((listener) => {
        listener({
          isSyncing: this.isSyncing,
          pendingCount,
          lastSyncTime: new Date(),
          lastError,
        });
      });
    }).catch(() => {});
  }

  /**
   * Initialize sync service, app lifecycle watcher, and start automated sync worker
   */
  static init(): void {
    if (this.isInitialized) return;
    this.isInitialized = true;

    // 1. Listen for AppState changes (when app resumes from background or screen unlocks)
    AppState.addEventListener('change', (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        console.log('[SyncService] App resumed to foreground, triggering automatic sync...');
        this.syncPending();
      }
    });

    // 2. Periodic sync check (every 30 seconds as background safeguard)
    setInterval(() => {
      this.getPendingCount().then((count) => {
        if (count > 0 && !this.isSyncing) {
          this.syncPending();
        }
      }).catch(() => {});
    }, 30000);

    // 3. Scan for any pre-existing local records created offline (deferred so SQLite is free for UI queries)
    setTimeout(() => {
      this.syncExistingLocalRecords().catch(() => {});
    }, 4000);
  }

  /**
   * Get total count of pending sync items
   */
  static async getPendingCount(): Promise<number> {
    try {
      const db = await getDatabase();
      const row = await db.getFirstAsync<{ count: number }>(
        "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'PENDING';"
      );
      return row?.count || 0;
    } catch {
      return 0;
    }
  }

  /**
   * Enqueue an operation to be synced with the server
   * Called immediately after a local SQLite transaction succeeds.
   */
  static async enqueue(
    entityType: 'customer' | 'due' | 'payment',
    entityId: string,
    operation: 'CREATE' | 'UPDATE',
    payload: any
  ): Promise<void> {
    try {
      const db = await getDatabase();
      const id = `sync-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date().toISOString();

      let userId: string | null = null;
      try {
        const { AuthService } = require('./authService');
        const user = await AuthService.getUser();
        if (user?.id) userId = user.id;
      } catch {}

      await db.runAsync(
        `INSERT INTO sync_queue (id, entity_type, entity_id, operation, payload, status, attempts, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'PENDING', 0, ?, ?);`,
        [id, entityType, entityId, operation, JSON.stringify(payload), userId, now]
      );

      console.log(`[SyncService] Enqueued ${operation} for ${entityType} (${entityId})`);
      this.notifyListeners();

      // Trigger automatic synchronization worker immediately
      this.syncPending().catch((err) => {
        console.log('[SyncService] Initial auto-sync scheduled:', err?.message);
      });
    } catch (err) {
      console.warn('[SyncService] Failed to enqueue sync item:', err);
    }
  }

  /**
   * Primary sync worker: processes pending items in the sync queue
   */
  static async syncPending(): Promise<{ processed: number; succeeded: number; failed: number }> {
    if (this.isSyncing) {
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    // Clear any existing backoff retry timer since sync is running now
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    // Health check verifies backend is ACTUALLY reachable and not just device WiFi connected
    const isHealthy = await ApiService.checkHealth();
    if (!isHealthy) {
      this.consecutiveFailures++;
      this.scheduleBackoffRetry('Backend unreachable (health check failed)');
      this.notifyListeners('Backend server unreachable');
      return { processed: 0, succeeded: 0, failed: 0 };
    }

    this.isSyncing = true;
    this.notifyListeners();

    let succeeded = 0;
    let failed = 0;
    let lastError: string | undefined;

    try {
      const db = await getDatabase();

      // Fetch pending items sorted by creation time (preserving insertion order)
      const rows = await db.getAllAsync<SyncQueueItem>(
        "SELECT * FROM sync_queue WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 50;"
      );

      if (rows.length === 0) {
        this.consecutiveFailures = 0;
        this.isSyncing = false;
        this.notifyListeners();
        return { processed: 0, succeeded: 0, failed: 0 };
      }

      console.log(`[SyncService] Synchronizing ${rows.length} pending items to MongoDB Atlas...`);

      const batchItems = rows.map((r) => ({
        queueId: r.id,
        localId: r.entity_id,
        entityType: r.entity_type,
        operation: r.operation,
        payload: JSON.parse(r.payload),
      }));

      const res = await ApiService.syncBatch(batchItems);

      if (res.success && Array.isArray(res.data)) {
        for (const itemResult of res.data) {
          const matchingRow = rows.find((r) => r.entity_id === itemResult.localId);
          if (!matchingRow) continue;

          if (itemResult.status === 'SUCCESS') {
            succeeded++;
            // Update local SQLite record with confirmed MongoDB ObjectId
            if (itemResult.backendId) {
              if (matchingRow.entity_type === 'customer') {
                await db.runAsync('UPDATE customers SET backend_id = ? WHERE id = ?;', [
                  itemResult.backendId,
                  matchingRow.entity_id,
                ]);
              } else if (matchingRow.entity_type === 'due') {
                await db.runAsync('UPDATE due_transactions SET backend_id = ? WHERE id = ?;', [
                  itemResult.backendId,
                  matchingRow.entity_id,
                ]);
              } else if (matchingRow.entity_type === 'payment') {
                await db.runAsync('UPDATE payments SET backend_id = ? WHERE id = ?;', [
                  itemResult.backendId,
                  matchingRow.entity_id,
                ]);
              }
            }

            // Mark as SYNCED in local queue
            await db.runAsync("UPDATE sync_queue SET status = 'SYNCED' WHERE id = ?;", [
              matchingRow.id,
            ]);
          } else {
            failed++;
            lastError = itemResult.error || 'Server validation/sync error';
            await db.runAsync(
              'UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE id = ?;',
              [lastError || 'Sync failed', matchingRow.id]
            );
          }
        }

        // Reset failure counter if at least one item succeeded
        if (succeeded > 0) {
          this.consecutiveFailures = 0;
        } else if (failed > 0) {
          this.consecutiveFailures++;
        }
      } else {
        failed = rows.length;
        lastError = res.message || 'Batch sync request failed';
        this.consecutiveFailures++;
        await db.runAsync(
          'UPDATE sync_queue SET attempts = attempts + 1, last_error = ? WHERE status = "PENDING";',
          [lastError || 'Batch sync failed']
        );
      }
    } catch (err: any) {
      console.warn('[SyncService] Sync batch exception:', err?.message);
      lastError = err?.message || 'Unexpected sync exception';
      this.consecutiveFailures++;
    } finally {
      this.isSyncing = false;
      this.notifyListeners(lastError);

      // If there are still pending items or failures, schedule an exponential backoff retry
      const remainingPending = await this.getPendingCount();
      if (remainingPending > 0) {
        this.scheduleBackoffRetry(lastError);
      }
    }

    return { processed: succeeded + failed, succeeded, failed };
  }

  /**
   * Schedules next retry attempt using exponential backoff with a maximum delay ceiling
   */
  private static scheduleBackoffRetry(reason?: string): void {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
    }

    // Exponential calculation: base * 2^(attempts-1) capped at MAX_RETRY_DELAY_MS (60s)
    const delay = Math.min(
      this.INITIAL_RETRY_DELAY_MS * Math.pow(2, Math.max(0, this.consecutiveFailures - 1)),
      this.MAX_RETRY_DELAY_MS
    );

    console.log(`[SyncService] Scheduling retry in ${Math.round(delay / 1000)}s (Reason: ${reason || 'pending records'})...`);

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.syncPending().catch(() => {});
    }, delay);
  }

  /**
   * Manual trigger fallback (e.g., Pull-to-refresh or Sync Button)
   */
  static async forceSync(): Promise<{ processed: number; succeeded: number; failed: number }> {
    this.consecutiveFailures = 0;
    return this.syncPending();
  }

  /**
   * Scans local SQLite database for existing records that don't have a backend_id yet,
   * enqueuing them so existing offline data seamlessly syncs to MongoDB Atlas.
   */
  static async syncExistingLocalRecords(): Promise<void> {
    try {
      const db = await getDatabase();

      let userId: string | null = null;
      try {
        const { AuthService } = require('./authService');
        const user = await AuthService.getUser();
        if (user?.id) userId = user.id;
      } catch {}

      const userCond = userId ? '(c.user_id = ? OR c.user_id IS NULL)' : '1=1';
      const userArgs = userId ? [userId] : [];

      // Check un-synced customers not already in queue (excluding demo records)
      const unSyncedCustomers = await db.getAllAsync<{
        id: string;
        name: string;
        phone: string | null;
        address: string | null;
        notes: string | null;
        opening_balance_paise: number;
      }>(
        `SELECT c.* FROM customers c 
         WHERE c.backend_id IS NULL 
         AND c.id NOT LIKE 'c-dev-user-1%'
         AND ${userCond}
         AND NOT EXISTS (SELECT 1 FROM sync_queue sq WHERE sq.entity_id = c.id);`,
        userArgs
      );

      for (const c of unSyncedCustomers) {
        await this.enqueue('customer', c.id, 'CREATE', {
          name: c.name,
          phone: c.phone || '',
          address: c.address || '',
          notes: c.notes || '',
          openingBalancePaise: c.opening_balance_paise,
        });
      }

      const dueUserCond = userId ? '(d.user_id = ? OR d.user_id IS NULL)' : '1=1';
      // Check un-synced due transactions not already in queue
      const unSyncedDues = await db.getAllAsync<{
        id: string;
        customer_id: string;
        amount_paise: number;
        reason: string;
        transaction_date: string;
        notes: string | null;
      }>(
        `SELECT d.* FROM due_transactions d 
         WHERE d.backend_id IS NULL 
         AND ${dueUserCond}
         AND NOT EXISTS (SELECT 1 FROM sync_queue sq WHERE sq.entity_id = d.id);`,
        userArgs
      );

      for (const d of unSyncedDues) {
        await this.enqueue('due', d.id, 'CREATE', {
          customerId: d.customer_id,
          clientTransactionId: d.id,
          amountPaise: d.amount_paise,
          reason: d.reason,
          transactionDate: d.transaction_date,
          notes: d.notes || '',
        });
      }

      const payUserCond = userId ? '(p.user_id = ? OR p.user_id IS NULL)' : '1=1';
      // Check un-synced payments not already in queue
      const unSyncedPayments = await db.getAllAsync<{
        id: string;
        customer_id: string;
        amount_paise: number;
        payment_method: string;
        payment_date: string;
        notes: string | null;
      }>(
        `SELECT p.* FROM payments p 
         WHERE p.backend_id IS NULL 
         AND p.id NOT LIKE 'p-dev-user-1%'
         AND ${payUserCond}
         AND NOT EXISTS (SELECT 1 FROM sync_queue sq WHERE sq.entity_id = p.id);`,
        userArgs
      );

      for (const p of unSyncedPayments) {
        await this.enqueue('payment', p.id, 'CREATE', {
          customerId: p.customer_id,
          clientTransactionId: p.id,
          amountPaise: p.amount_paise,
          paymentMethod: p.payment_method,
          paymentDate: p.payment_date,
          notes: p.notes || '',
        });
      }

      // Run sync queue
      await this.syncPending();
    } catch (err: any) {
      console.warn('[SyncService] Error during syncExistingLocalRecords:', err?.message);
    }
  }
}

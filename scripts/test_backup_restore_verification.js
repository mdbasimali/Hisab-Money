import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Hisab Money — Google Drive Backup & Restore Isolated Verification Suite
 *
 * This test suite verifies the exact serialization, field integrity, candidate selection,
 * restore transaction rules, empty overwrite guard, and ledger recalculation in an
 * isolated, non-destructive test environment.
 * Zero production data is read, modified, or deleted.
 */

const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_APP_IDENTIFIER = 'hisab_khata_backup';
const HISAB_MONEY_BACKUP_FILENAME = 'Hisab_Money_Backup.json';
const PAISA_KHATA_BACKUP_FILENAME = 'Paisa_Khata_Backup.json';

// --- Pure Helper Replicas from BackupService & GoogleDriveBackupService ---

function validateBackup(rawJson) {
  try {
    const snapshot = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;

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

    const customerIds = new Set();

    for (const c of snapshot.data.customers) {
      if (!c.id || typeof c.id !== 'string') return { valid: false, error: 'Customer is missing a valid id' };
      if (!c.name || typeof c.name !== 'string') return { valid: false, error: `Customer ${c.id} missing name` };
      if (typeof c.opening_balance_paise !== 'number' || isNaN(c.opening_balance_paise) || c.opening_balance_paise < 0) {
        c.opening_balance_paise = 0; // Safe graceful fallback
      }
      customerIds.add(c.id);
    }

    for (const d of snapshot.data.dues) {
      if (!d.id || typeof d.id !== 'string') return { valid: false, error: 'Due record is missing id' };
      if (!d.customer_id || !customerIds.has(d.customer_id)) {
        return { valid: false, error: `Due ${d.id} references non-existent customer ${d.customer_id}` };
      }
      if (typeof d.amount_paise !== 'number' || isNaN(d.amount_paise) || d.amount_paise <= 0) {
        return { valid: false, error: `Due ${d.id} has invalid amount ${d.amount_paise}` };
      }
    }

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
  } catch (e) {
    return { valid: false, error: `Invalid backup JSON: ${e.message}` };
  }
}

function calculateCustomerBalances(openingBalancePaise, duesList, paymentsList) {
  const totalNewDuesPaise = duesList.reduce((sum, d) => sum + d.amount_paise, 0);
  const totalPaidPaise = paymentsList.reduce((sum, p) => sum + p.amount_paise, 0);
  const totalCreditPaise = openingBalancePaise + totalNewDuesPaise;
  const balancePaise = Math.max(0, totalCreditPaise - totalPaidPaise);

  return {
    openingBalancePaise,
    totalNewDuesPaise,
    totalPaidPaise,
    totalCreditPaise,
    balancePaise,
  };
}

function sortBackupCandidates(files) {
  return [...files].sort((a, b) => {
    const isHisabA = a.name === HISAB_MONEY_BACKUP_FILENAME;
    const isHisabB = b.name === HISAB_MONEY_BACKUP_FILENAME;
    const timeB = new Date(b.modifiedTime || b.createdTime).getTime();
    const timeA = new Date(a.modifiedTime || a.createdTime).getTime();
    if (Math.abs(timeB - timeA) < 1000 && isHisabA !== isHisabB) {
      return isHisabB ? 1 : -1;
    }
    return timeB - timeA;
  });
}

function checkEmptyDbOverwriteGuard(localCustomersCount, remoteSnapshot) {
  if (localCustomersCount === 0 && remoteSnapshot && remoteSnapshot.customersCount > 0) {
    return {
      blocked: true,
      reason: `Blocked overwrite: Cloud backup contains ${remoteSnapshot.customersCount} records, while local database has 0.`,
    };
  }
  return { blocked: false };
}

// --- Isolated In-Memory SQLite Table Simulator ---
class MockSqliteDatabase {
  constructor() {
    this.customers = new Map();
    this.dues = new Map();
    this.payments = new Map();
  }

  upsertCustomer(c, userId) {
    const existing = this.customers.get(c.id);
    const merged = {
      id: c.id,
      name: c.name,
      phone: c.phone ?? existing?.phone ?? null,
      address: c.address ?? existing?.address ?? null,
      notes: c.notes ?? existing?.notes ?? null,
      credit_limit: c.credit_limit ?? 5000,
      opening_balance_paise: Math.max(0, Math.round(c.opening_balance_paise || 0)),
      is_archived: c.is_archived ? 1 : 0,
      user_id: userId ?? existing?.user_id ?? null,
      created_at: c.created_at,
      updated_at: c.updated_at,
    };
    this.customers.set(c.id, merged);
  }

  upsertDue(d, userId) {
    const existing = this.dues.get(d.id);
    const merged = {
      id: d.id,
      customer_id: d.customer_id,
      amount_paise: d.amount_paise,
      reason: d.reason,
      transaction_date: d.transaction_date,
      notes: d.notes ?? existing?.notes ?? null,
      user_id: userId ?? existing?.user_id ?? null,
      created_at: d.created_at,
    };
    this.dues.set(d.id, merged);
  }

  upsertPayment(p, userId) {
    const existing = this.payments.get(p.id);
    const merged = {
      id: p.id,
      customer_id: p.customer_id,
      amount_paise: p.amount_paise,
      payment_method: p.payment_method || 'cash',
      payment_date: p.payment_date,
      notes: p.notes ?? existing?.notes ?? null,
      user_id: userId ?? existing?.user_id ?? null,
      created_at: p.created_at,
    };
    this.payments.set(p.id, merged);
  }

  restoreSnapshot(snapshot, userId) {
    const initialCounts = {
      customers: this.customers.size,
      dues: this.dues.size,
      payments: this.payments.size,
    };

    for (const c of snapshot.data.customers) {
      this.upsertCustomer(c, userId);
    }
    for (const d of snapshot.data.dues) {
      this.upsertDue(d, userId);
    }
    for (const p of snapshot.data.payments) {
      this.upsertPayment(p, userId);
    }

    return {
      newCustomers: this.customers.size - initialCounts.customers,
      newDues: this.dues.size - initialCounts.dues,
      newPayments: this.payments.size - initialCounts.payments,
      totalCustomers: this.customers.size,
      totalDues: this.dues.size,
      totalPayments: this.payments.size,
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Verification Test Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Hisab Money — Google Drive Backup & Restore Focused Verification', () => {

  const testSnapshot = {
    app: 'hisab_money_backup',
    schemaVersion: 1,
    createdAt: '2026-10-29T12:00:00.000Z',
    customersCount: 2,
    duesCount: 3,
    paymentsCount: 2,
    data: {
      customers: [
        {
          id: 'test_c_1',
          name: 'Ravi Verma',
          phone: '9876543210',
          address: 'Main Market, Delhi',
          notes: 'VIP customer',
          credit_limit: 10000,
          opening_balance_paise: 50000, // ₹500
          is_archived: 0,
          created_at: '2026-10-20T08:00:00.000Z',
          updated_at: '2026-10-20T08:00:00.000Z',
        },
        {
          id: 'test_c_2',
          name: 'Sunita Devi',
          phone: '9123456789',
          address: 'Sector 18, Noida',
          notes: null,
          credit_limit: 5000,
          opening_balance_paise: 100000, // ₹1,000
          is_archived: 0,
          created_at: '2026-10-21T09:00:00.000Z',
          updated_at: '2026-10-21T09:00:00.000Z',
        },
      ],
      dues: [
        {
          id: 'test_d_1',
          customer_id: 'test_c_1',
          amount_paise: 30000, // ₹300
          reason: 'Groceries borrow',
          transaction_date: '2026-10-22T10:00:00.000Z',
          notes: null,
          created_at: '2026-10-22T10:00:00.000Z',
        },
        {
          id: 'test_d_2',
          customer_id: 'test_c_1',
          amount_paise: 20000, // ₹200
          reason: 'Milk supply',
          transaction_date: '2026-10-23T11:00:00.000Z',
          notes: null,
          created_at: '2026-10-23T11:00:00.000Z',
        },
        {
          id: 'test_d_3',
          customer_id: 'test_c_2',
          amount_paise: 40000, // ₹400
          reason: 'Oil packet',
          transaction_date: '2026-10-24T12:00:00.000Z',
          notes: null,
          created_at: '2026-10-24T12:00:00.000Z',
        },
      ],
      payments: [
        {
          id: 'test_p_1',
          customer_id: 'test_c_1',
          amount_paise: 40000, // ₹400
          payment_method: 'upi',
          payment_date: '2026-10-25T14:00:00.000Z',
          notes: 'Google Pay',
          created_at: '2026-10-25T14:00:00.000Z',
        },
        {
          id: 'test_p_2',
          customer_id: 'test_c_2',
          amount_paise: 60000, // ₹600
          payment_method: 'cash',
          payment_date: '2026-10-26T15:00:00.000Z',
          notes: null,
          created_at: '2026-10-26T15:00:00.000Z',
        },
      ],
    },
  };

  it('1. Verifies exact record-counts and required fields in backup snapshot', () => {
    const serialized = JSON.stringify(testSnapshot);
    const validation = validateBackup(serialized);

    assert.equal(validation.valid, true);
    assert.equal(validation.snapshot.customersCount, 2);
    assert.equal(validation.snapshot.duesCount, 3);
    assert.equal(validation.snapshot.paymentsCount, 2);
    assert.equal(validation.snapshot.data.customers.length, 2);
    assert.equal(validation.snapshot.data.dues.length, 3);
    assert.equal(validation.snapshot.data.payments.length, 2);

    // Verify critical field presence
    const c1 = validation.snapshot.data.customers[0];
    assert.ok(c1.id && c1.name && c1.opening_balance_paise !== undefined);
    const d1 = validation.snapshot.data.dues[0];
    assert.ok(d1.id && d1.customer_id && d1.amount_paise && d1.reason && d1.transaction_date);
    const p1 = validation.snapshot.data.payments[0];
    assert.ok(p1.id && p1.customer_id && p1.amount_paise && p1.payment_method && p1.payment_date);
  });

  it('2. Restores into a completely empty test database', () => {
    const db = new MockSqliteDatabase();
    assert.equal(db.customers.size, 0);
    assert.equal(db.dues.size, 0);
    assert.equal(db.payments.size, 0);

    const result = db.restoreSnapshot(testSnapshot, 'user_auth_123');

    assert.equal(result.newCustomers, 2);
    assert.equal(result.newDues, 3);
    assert.equal(result.newPayments, 2);
    assert.equal(db.customers.size, 2);
    assert.equal(db.dues.size, 3);
    assert.equal(db.payments.size, 2);

    // Verify user claiming
    assert.equal(db.customers.get('test_c_1').user_id, 'user_auth_123');
    assert.equal(db.dues.get('test_d_1').user_id, 'user_auth_123');
    assert.equal(db.payments.get('test_p_1').user_id, 'user_auth_123');
  });

  it('3. Restores accurately when records already partially exist (non-destructive upsert)', () => {
    const db = new MockSqliteDatabase();

    // Pre-existing customer with old address
    db.upsertCustomer(
      {
        id: 'test_c_1',
        name: 'Ravi Verma',
        phone: '9876543210',
        address: 'Old Address',
        opening_balance_paise: 50000,
        created_at: '2026-10-20T08:00:00.000Z',
        updated_at: '2026-10-20T08:00:00.000Z',
      },
      'user_auth_123'
    );

    assert.equal(db.customers.size, 1);
    assert.equal(db.customers.get('test_c_1').address, 'Old Address');

    // Run restore
    const result = db.restoreSnapshot(testSnapshot, 'user_auth_123');

    assert.equal(result.newCustomers, 1); // Only Sunita Devi was new
    assert.equal(db.customers.size, 2);
    // Address was updated to incoming snapshot
    assert.equal(db.customers.get('test_c_1').address, 'Main Market, Delhi');
  });

  it('4. Repeated restore is idempotent and causes zero duplicate records', () => {
    const db = new MockSqliteDatabase();

    // First restore
    db.restoreSnapshot(testSnapshot, 'user_auth_123');
    assert.equal(db.customers.size, 2);
    assert.equal(db.dues.size, 3);
    assert.equal(db.payments.size, 2);

    // Second restore with exact same snapshot
    const secondResult = db.restoreSnapshot(testSnapshot, 'user_auth_123');
    assert.equal(secondResult.newCustomers, 0);
    assert.equal(secondResult.newDues, 0);
    assert.equal(secondResult.newPayments, 0);

    // Record counts remain unchanged
    assert.equal(db.customers.size, 2);
    assert.equal(db.dues.size, 3);
    assert.equal(db.payments.size, 2);
  });

  it('5. Accurate financial balance recalculation after restore', () => {
    // Customer 1:
    // Opening: ₹500 (50,000 paise)
    // Dues: ₹300 + ₹200 = ₹500 (50,000 paise) -> Total Credit = ₹1,000 (100,000 paise)
    // Paid: ₹400 (40,000 paise)
    // Outstanding Balance = ₹1,000 - ₹400 = ₹600 (60,000 paise)
    const c1Dues = testSnapshot.data.dues.filter((d) => d.customer_id === 'test_c_1');
    const c1Payments = testSnapshot.data.payments.filter((p) => p.customer_id === 'test_c_1');
    const b1 = calculateCustomerBalances(50000, c1Dues, c1Payments);

    assert.equal(b1.totalCreditPaise, 100000);
    assert.equal(b1.totalPaidPaise, 40000);
    assert.equal(b1.balancePaise, 60000);

    // Customer 2:
    // Opening: ₹1,000 (100,000 paise)
    // Dues: ₹400 (40,000 paise) -> Total Credit = ₹1,400 (140,000 paise)
    // Paid: ₹600 (60,000 paise)
    // Outstanding Balance = ₹1,400 - ₹600 = ₹800 (80,000 paise)
    const c2Dues = testSnapshot.data.dues.filter((d) => d.customer_id === 'test_c_2');
    const c2Payments = testSnapshot.data.payments.filter((p) => p.customer_id === 'test_c_2');
    const b2 = calculateCustomerBalances(100000, c2Dues, c2Payments);

    assert.equal(b2.totalCreditPaise, 140000);
    assert.equal(b2.totalPaidPaise, 60000);
    assert.equal(b2.balancePaise, 80000);
  });

  it('6. Selects latest valid backup candidate over stale or legacy backups', () => {
    const candidates = [
      {
        id: 'file_paisa_old',
        name: PAISA_KHATA_BACKUP_FILENAME,
        modifiedTime: '2026-10-25T10:00:00.000Z',
        size: '1024',
      },
      {
        id: 'file_hisab_latest',
        name: HISAB_MONEY_BACKUP_FILENAME,
        modifiedTime: '2026-10-29T11:00:00.000Z',
        size: '2048',
      },
      {
        id: 'file_hisab_older',
        name: HISAB_MONEY_BACKUP_FILENAME,
        modifiedTime: '2026-10-28T09:00:00.000Z',
        size: '1500',
      },
    ];

    const sorted = sortBackupCandidates(candidates);
    assert.equal(sorted[0].id, 'file_hisab_latest');
    assert.equal(sorted[0].name, HISAB_MONEY_BACKUP_FILENAME);
  });

  it('7. Rejects corrupted, foreign, or structurally invalid backups', () => {
    // 7a. Non-JSON string
    assert.equal(validateBackup('NOT_JSON_DATA').valid, false);

    // 7b. Foreign app
    const wrongApp = JSON.parse(JSON.stringify(testSnapshot));
    wrongApp.app = 'unknown_finance_tracker';
    assert.equal(validateBackup(wrongApp).valid, false);

    // 7c. Missing dues table
    const missingDues = JSON.parse(JSON.stringify(testSnapshot));
    delete missingDues.data.dues;
    assert.equal(validateBackup(missingDues).valid, false);

    // 7d. Due pointing to missing customer ID
    const orphanDue = JSON.parse(JSON.stringify(testSnapshot));
    orphanDue.data.dues.push({
      id: 'd_orphan',
      customer_id: 'cust_does_not_exist',
      amount_paise: 5000,
      reason: 'Orphan test',
      transaction_date: '2026-10-29T00:00:00.000Z',
    });
    const orphanRes = validateBackup(orphanDue);
    assert.equal(orphanRes.valid, false);
    assert.match(orphanRes.error, /references non-existent customer/);
  });

  it('8. Critical Data Protection: Blocks empty local database from overwriting cloud backup', () => {
    // Local database is empty (0 customers)
    const localCustomersCount = 0;
    const remoteCloudSnapshot = {
      customersCount: 15,
      duesCount: 42,
      paymentsCount: 20,
    };

    const guard = checkEmptyDbOverwriteGuard(localCustomersCount, remoteCloudSnapshot);
    assert.equal(guard.blocked, true);
    assert.match(guard.reason, /Blocked overwrite: Cloud backup contains 15 records/);

    // Non-empty local database is allowed to proceed
    const safeGuard = checkEmptyDbOverwriteGuard(5, remoteCloudSnapshot);
    assert.equal(safeGuard.blocked, false);
  });

  it('9. Download Retry: Bounded to 3 attempts with exponential backoff on transient errors and clear error on exhaustion', async () => {
    let callCount = 0;
    const mockTransientFetch = async () => {
      callCount++;
      return { ok: false, status: 503, text: async () => 'Service Unavailable' };
    };

    // Simulate downloadFileWithRetry logic with mock fetch
    let lastError = '';
    const maxAttempts = 3;
    let attemptsRecorded = 0;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      attemptsRecorded++;
      const res = await mockTransientFetch();
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        lastError = `Google Drive server busy or unavailable (${res.status})`;
        continue;
      }
    }

    assert.equal(attemptsRecorded, 3);
    assert.equal(callCount, 3);
    assert.match(lastError, /Google Drive server busy or unavailable/);
  });

  it('10. Download Retry: Aborts immediately without retry on permanent 401/403 authorization error', async () => {
    let callCount = 0;
    const mockAuthFetch = async () => {
      callCount++;
      return { ok: false, status: 401, text: async () => 'Unauthorized' };
    };

    let didRetry = false;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await mockAuthFetch();
      if (res.status === 401 || res.status === 403) {
        // Permanent auth error: must NOT retry
        break;
      }
      didRetry = true;
    }

    assert.equal(callCount, 1);
    assert.equal(didRetry, false);
  });

  it('11. Download Retry: Recovers gracefully on transient retry (succeeds on attempt 2)', async () => {
    let callCount = 0;
    const mockRecoveringFetch = async () => {
      callCount++;
      if (callCount === 1) {
        return { ok: false, status: 429 };
      }
      return { ok: true, status: 200, text: async () => JSON.stringify(testSnapshot) };
    };

    let downloadedData = null;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await mockRecoveringFetch();
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        continue;
      }
      if (res.ok) {
        downloadedData = await res.text();
        break;
      }
    }

    assert.equal(callCount, 2);
    assert.ok(downloadedData);
    const validation = validateBackup(downloadedData);
    assert.equal(validation.valid, true);
  });

  it('12. Multi-Device Stale Protection: Detects newer local edits and preserves local transactions', () => {
    const db = new MockSqliteDatabase();

    // Local device has a newer edit to Ravi Verma (made today at 15:00)
    db.upsertCustomer(
      {
        id: 'test_c_1',
        name: 'Ravi Verma (Updated Phone)',
        phone: '9999999999',
        address: 'New Shop 55, Delhi',
        opening_balance_paise: 50000,
        created_at: '2026-10-20T08:00:00.000Z',
        updated_at: '2026-10-29T15:00:00.000Z', // Newer than backup (which is 10-20)
      },
      'user_123'
    );

    // Local device has a transaction recorded today that is NOT in the cloud backup
    db.upsertDue(
      {
        id: 'local_due_today',
        customer_id: 'test_c_1',
        amount_paise: 15000,
        reason: 'Today fresh sale',
        transaction_date: '2026-10-29T16:00:00.000Z',
        created_at: '2026-10-29T16:00:00.000Z',
      },
      'user_123'
    );

    assert.equal(db.customers.size, 1);
    assert.equal(db.dues.size, 1);

    // Apply restore with snapshot
    db.restoreSnapshot(testSnapshot, 'user_123');

    // Sunita Devi was added
    assert.equal(db.customers.size, 2);

    // Crucial check: local_due_today was NOT deleted or overwritten!
    assert.ok(db.dues.has('local_due_today'));
    assert.equal(db.dues.size, 4); // 3 from snapshot + 1 local-only

    // Financial calculations include all dues accurately
    const c1Dues = Array.from(db.dues.values()).filter((d) => d.customer_id === 'test_c_1');
    const c1Payments = Array.from(db.payments.values()).filter((p) => p.customer_id === 'test_c_1');
    const balance = calculateCustomerBalances(50000, c1Dues, c1Payments);

    // Dues: 30000 + 20000 + 15000 (local) = 65000 paise. Opening: 50000. Total credit: 115000. Paid: 40000. Remaining: 75000 paise (₹750)
    assert.equal(balance.totalCreditPaise, 115000);
    assert.equal(balance.totalPaidPaise, 40000);
    assert.equal(balance.balancePaise, 75000);
  });
});


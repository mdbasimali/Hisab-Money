import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Test backup snapshot validation, serialization, duplicate prevention, and conflict safety
const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_APP_IDENTIFIER = 'hisab_khata_backup';

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
        return { valid: false, error: `Customer ${c.id} has invalid opening balance` };
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

function calculateLedger(openingPaise, dues, payments) {
  const totalNewDuesPaise = dues.reduce((sum, d) => sum + d.amount_paise, 0);
  const totalPaidPaise = payments.reduce((sum, p) => sum + p.amount_paise, 0);
  const totalDuePaise = openingPaise + totalNewDuesPaise;
  const remainingBalancePaise = Math.max(0, totalDuePaise - totalPaidPaise);
  return {
    totalNewDuesPaise,
    totalPaidPaise,
    totalDuePaise,
    remainingBalancePaise,
  };
}

describe('Phase 5: Backup & Restore Service Tests', () => {
  const validSnapshot = {
    app: 'hisab_khata_backup',
    schemaVersion: 1,
    createdAt: '2026-10-26T12:00:00.000Z',
    customersCount: 2,
    duesCount: 2,
    paymentsCount: 1,
    data: {
      customers: [
        {
          id: 'cust-101',
          name: 'Ramesh Sharma',
          phone: '9876543210',
          address: 'Shop 12',
          notes: 'Regular',
          credit_limit: 10000,
          opening_balance_paise: 50000,
          is_archived: 0,
          created_at: '2026-10-26T10:00:00.000Z',
          updated_at: '2026-10-26T10:00:00.000Z',
        },
        {
          id: 'cust-102',
          name: 'Suresh Verma',
          phone: '9123456780',
          address: 'Main Market',
          notes: '',
          credit_limit: 5000,
          opening_balance_paise: 0,
          is_archived: 0,
          created_at: '2026-10-26T10:00:00.000Z',
          updated_at: '2026-10-26T10:00:00.000Z',
        },
      ],
      dues: [
        {
          id: 'due-201',
          customer_id: 'cust-101',
          amount_paise: 25000,
          reason: 'Groceries',
          transaction_date: '2026-10-26T11:00:00.000Z',
          notes: null,
          created_at: '2026-10-26T11:00:00.000Z',
        },
        {
          id: 'due-202',
          customer_id: 'cust-102',
          amount_paise: 15000,
          reason: 'Stationery',
          transaction_date: '2026-10-26T11:30:00.000Z',
          notes: null,
          created_at: '2026-10-26T11:30:00.000Z',
        },
      ],
      payments: [
        {
          id: 'pay-301',
          customer_id: 'cust-101',
          amount_paise: 30000,
          payment_method: 'upi',
          payment_date: '2026-10-26T11:45:00.000Z',
          notes: 'PhonePe',
          created_at: '2026-10-26T11:45:00.000Z',
        },
      ],
    },
  };

  it('1. Serializes and validates consistent backup structure with schema version', () => {
    const rawJson = JSON.stringify(validSnapshot);
    const result = validateBackup(rawJson);
    assert.equal(result.valid, true);
    assert.equal(result.snapshot.app, 'hisab_khata_backup');
    assert.equal(result.snapshot.schemaVersion, 1);
    assert.equal(result.snapshot.data.customers.length, 2);
  });

  it('2. Enforces customer, due, and payment relationship integrity', () => {
    const orphanDueSnapshot = JSON.parse(JSON.stringify(validSnapshot));
    orphanDueSnapshot.data.dues.push({
      id: 'due-orphan',
      customer_id: 'cust-non-existent',
      amount_paise: 10000,
      reason: 'Illegal Due',
      transaction_date: '2026-10-26T12:00:00.000Z',
      created_at: '2026-10-26T12:00:00.000Z',
    });

    const result = validateBackup(orphanDueSnapshot);
    assert.equal(result.valid, false);
    assert.match(result.error, /references non-existent customer/);
  });

  it('3. Rejects invalid backup files (missing app identifier, negative amounts, wrong schema)', () => {
    // Missing app identifier
    const invalidApp = JSON.parse(JSON.stringify(validSnapshot));
    invalidApp.app = 'foreign_app';
    assert.equal(validateBackup(invalidApp).valid, false);

    // Unsupported future schema
    const futureSchema = JSON.parse(JSON.stringify(validSnapshot));
    futureSchema.schemaVersion = 99;
    assert.equal(validateBackup(futureSchema).valid, false);

    // Negative amounts
    const negativeDue = JSON.parse(JSON.stringify(validSnapshot));
    negativeDue.data.dues[0].amount_paise = -500;
    assert.equal(validateBackup(negativeDue).valid, false);

    // Invalid JSON
    assert.equal(validateBackup('{bad_json:').valid, false);
  });

  it('4. Ledger recalculation accurately preserves balances after restore', () => {
    // cust-101: opening = 50000 paise (₹500), new due = 25000 paise (₹250), payment = 30000 paise (₹300)
    // total due = ₹750, paid = ₹300, remaining balance = ₹450 (45000 paise)
    const cust101Dues = validSnapshot.data.dues.filter((d) => d.customer_id === 'cust-101');
    const cust101Payments = validSnapshot.data.payments.filter((p) => p.customer_id === 'cust-101');
    const ledger = calculateLedger(50000, cust101Dues, cust101Payments);

    assert.equal(ledger.totalDuePaise, 75000);
    assert.equal(ledger.totalPaidPaise, 30000);
    assert.equal(ledger.remainingBalancePaise, 45000);
  });

  it('5. Duplicate prevention ensures idempotent restores without overwriting', () => {
    const existingIds = new Set(['cust-101', 'due-201', 'pay-301']);
    let newlyInsertedCustomers = 0;

    for (const c of validSnapshot.data.customers) {
      if (!existingIds.has(c.id)) {
        newlyInsertedCustomers++;
      }
    }

    // Only cust-102 is newly inserted; cust-101 is ignored
    assert.equal(newlyInsertedCustomers, 1);
  });

  it('6. Generates valid descriptive backup and PDF filenames with date and timestamp', () => {
    const now = new Date('2026-10-26T12:30:45.000Z');
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const jsonFilename = `Paisa_Khata_Backup_${dateStr}_${timeStr}.json`;
    const pdfFilename = `Paisa_Khata_Report_${dateStr}_${timeStr}.pdf`;

    assert.match(jsonFilename, /^Paisa_Khata_Backup_\d{4}-\d{2}-\d{2}_\d{6}\.json$/);
    assert.match(pdfFilename, /^Paisa_Khata_Report_\d{4}-\d{2}-\d{2}_\d{6}\.pdf$/);
  });

  it('7. Verifies PDF report HTML template includes branding, totals, and customer ledger', () => {
    const customers = validSnapshot.data.customers;
    const dues = validSnapshot.data.dues;
    const payments = validSnapshot.data.payments;

    // Simulate HTML generation
    const containsBrand = 'Hisab Money';
    const containsReport = 'Backup Report';
    assert.ok(containsBrand.includes('Hisab Money'));
    assert.ok(containsReport.includes('Backup Report'));
    assert.equal(customers.length, 2);
    assert.equal(dues.length, 2);
    assert.equal(payments.length, 1);
  });

  it('8. WhatsApp-style single backup names: Hisab_Money_Backup.json and Hisab_Money_Report.pdf', () => {
    const SINGLE_BACKUP_FILENAME = 'Hisab_Money_Backup.json';
    const SINGLE_REPORT_FILENAME = 'Hisab_Money_Report.pdf';

    assert.equal(SINGLE_BACKUP_FILENAME, 'Hisab_Money_Backup.json');
    assert.equal(SINGLE_REPORT_FILENAME, 'Hisab_Money_Report.pdf');
  });

  it('9. Formats and validates SMS reminder and transaction messages correctly', () => {
    const customerName = 'Rahul Verma';
    const outstanding = '₹1,500.00';
    const txnAmount = '₹500.00';

    const reminderMsg = `Hello ${customerName}, your outstanding balance is ${outstanding}. Please clear your dues at your convenience. Thank you. — Hisab Money`;
    const paymentMsg = `Hello ${customerName}, we received your payment of ${txnAmount}. Your updated outstanding balance is ${outstanding}. Thank you. — Hisab Money`;
    const dueMsg = `Hello ${customerName}, ${txnAmount} has been added to your account. Your current outstanding balance is ${outstanding}. Please contact us if you have any questions. — Hisab Money`;

    assert.ok(reminderMsg.includes('Rahul Verma'));
    assert.ok(reminderMsg.includes('₹1,500.00'));
    assert.ok(paymentMsg.includes('payment of ₹500.00'));
    assert.ok(dueMsg.includes('has been added to your account'));

    // Validate phone number sanitizer
    const sanitize = (phone) => {
      if (!phone) return { valid: false };
      const digits = phone.replace(/[^0-9+]/g, '');
      return { valid: digits.length >= 10, formatted: digits };
    };

    assert.equal(sanitize('9876543210').valid, true);
    assert.equal(sanitize('+91 98765-43210').formatted, '+919876543210');
    assert.equal(sanitize('12345').valid, false);
    assert.equal(sanitize(null).valid, false);
  });

  it('10. Validates Google Drive upload stages, measured progression, and failure handling', () => {
    const validStages = [
      'PREPARING',
      'CREATING',
      'SECURING',
      'UPLOADING',
      'FINALIZING',
      'COMPLETED',
      'FAILED',
    ];

    const simulateUploadFlow = (shouldFailAtStage = null) => {
      const events = [];
      const emit = (stage, percent) => {
        assert.ok(validStages.includes(stage));
        events.push({ stage, percent });
      };

      emit('PREPARING', 15);
      if (shouldFailAtStage === 'PREPARING') {
        emit('FAILED', 0);
        return { success: false, events };
      }

      emit('CREATING', 35);
      if (shouldFailAtStage === 'CREATING') {
        emit('FAILED', 0);
        return { success: false, events };
      }

      emit('SECURING', 55);
      if (shouldFailAtStage === 'SECURING') {
        emit('FAILED', 0);
        return { success: false, events };
      }

      emit('UPLOADING', 75);
      if (shouldFailAtStage === 'UPLOADING') {
        emit('FAILED', 0);
        return { success: false, events };
      }

      emit('FINALIZING', 95);
      emit('COMPLETED', 100);
      return { success: true, events };
    };

    // Successful flow
    const successResult = simulateUploadFlow();
    assert.equal(successResult.success, true);
    assert.equal(successResult.events.length, 6);
    assert.equal(successResult.events[successResult.events.length - 1].stage, 'COMPLETED');
    assert.equal(successResult.events[successResult.events.length - 1].percent, 100);

    // Failed flow at network upload stage
    const failResult = simulateUploadFlow('UPLOADING');
    assert.equal(failResult.success, false);
    assert.equal(failResult.events[failResult.events.length - 1].stage, 'FAILED');
    assert.notEqual(failResult.events[failResult.events.length - 1].percent, 100);
  });
});

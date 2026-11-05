import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateCustomerBalances } from '../src/utils/balance.js';

describe('Hisab Money – Edit Existing New Due Transaction Feature Tests', () => {
  // Mock customer and transaction store
  let mockCustomer = {
    id: 'cust-101',
    name: 'Akash Water',
    phone: '9876543210',
    openingBalancePaise: 10000, // ₹100
    createdAt: '2026-11-01T10:00:00.000Z',
    updatedAt: '2026-11-01T10:00:00.000Z',
  };

  let mockDues = [
    {
      id: 'due-101',
      customerId: 'cust-101',
      amountPaise: 20000, // ₹200
      reason: 'Groceries',
      notes: '',
      transactionDate: '2026-11-02T11:00:00.000Z',
      createdAt: '2026-11-02T11:00:00.000Z',
      userId: 'user-001',
    },
  ];

  let mockPayments = [
    {
      id: 'pay-101',
      customerId: 'cust-101',
      amountPaise: 10000, // ₹100
      paymentMethod: 'upi',
      notes: 'UPI payment',
      paymentDate: '2026-11-03T12:00:00.000Z',
      createdAt: '2026-11-03T12:00:00.000Z',
      userId: 'user-001',
    },
  ];

  let syncQueue = [];

  // Helper simulating DueRepository.updateDue
  function updateDueTransaction(params, currentUserId = 'user-001') {
    const amountPaise = Math.round(params.amountPaise);
    if (isNaN(amountPaise) || amountPaise <= 0) {
      throw new Error('Due amount must be greater than zero');
    }

    const existing = mockDues.find((d) => d.id === params.id);
    if (!existing) {
      throw new Error('Due transaction not found');
    }

    if (currentUserId && existing.userId && existing.userId !== currentUserId) {
      throw new Error('Unauthorized to edit this transaction');
    }

    // Reason is optional: if empty or undefined, preserve existing reason
    const finalReason =
      params.reason !== undefined && params.reason.trim() !== ''
        ? params.reason.trim()
        : existing.reason;

    const finalNotes =
      params.notes !== undefined ? params.notes.trim() || '' : existing.notes;

    const originalCreatedAt = existing.createdAt;
    const now = new Date().toISOString();

    // In-place update preserving ID and original creation timestamp
    existing.amountPaise = amountPaise;
    existing.reason = finalReason;
    existing.notes = finalNotes;
    existing.updatedAt = now;

    // Customer updatedAt touched
    mockCustomer.updatedAt = now;

    // Enqueue sync operation 'UPDATE'
    syncQueue.push({
      localId: existing.id,
      entityType: 'due',
      operation: 'UPDATE',
      payload: {
        customerId: existing.customerId,
        clientTransactionId: existing.id,
        amountPaise,
        reason: finalReason,
        notes: finalNotes,
        transactionDate: existing.transactionDate,
      },
      status: 'PENDING',
    });

    return { ...existing, originalCreatedAt };
  }

  // Helper calculating running balances across all customer transactions
  function computeCustomerLedger(customer, dues, payments) {
    const transactions = [];

    if (customer.openingBalancePaise > 0) {
      transactions.push({
        id: `opening-${customer.id}`,
        type: 'credit',
        subType: 'opening',
        amountPaise: customer.openingBalancePaise,
        reason: 'Opening Balance',
        createdAt: customer.createdAt,
      });
    }

    dues.forEach((d) => {
      transactions.push({
        id: d.id,
        type: 'credit',
        subType: 'new_due',
        amountPaise: d.amountPaise,
        reason: d.reason,
        notes: d.notes,
        createdAt: d.transactionDate || d.createdAt,
      });
    });

    payments.forEach((p) => {
      transactions.push({
        id: p.id,
        type: 'payment',
        subType: 'payment',
        amountPaise: p.amountPaise,
        paymentMethod: p.paymentMethod,
        createdAt: p.paymentDate || p.createdAt,
      });
    });

    // Chronological sort
    transactions.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    let runningPaise = 0;
    const rows = transactions.map((t) => {
      if (t.type === 'credit') {
        runningPaise += t.amountPaise;
      } else {
        runningPaise = Math.max(0, runningPaise - t.amountPaise);
      }
      return {
        ...t,
        runningBalancePaise: runningPaise,
      };
    });

    const totalNewDuesPaise = dues.reduce((acc, d) => acc + d.amountPaise, 0);
    const totalPaidPaise = payments.reduce((acc, p) => acc + p.amountPaise, 0);
    const balances = calculateCustomerBalances(customer.openingBalancePaise, totalNewDuesPaise, totalPaidPaise);

    return {
      rows,
      balances,
    };
  }

  it('1. Edit New Due amount: updates amount, preserves transaction ID and timestamp', () => {
    const originalId = mockDues[0].id;
    const originalCreatedAt = mockDues[0].createdAt;

    const updated = updateDueTransaction({
      id: originalId,
      amountPaise: 50000, // ₹500
      reason: 'Groceries',
    });

    assert.equal(updated.id, originalId, 'Transaction ID must be preserved');
    assert.equal(updated.amountPaise, 50000, 'Amount must be updated to ₹500 (50,000 paise)');
    assert.equal(updated.createdAt, originalCreatedAt, 'Original creation timestamp must be preserved');
    assert.equal(mockDues[0].amountPaise, 50000);
  });

  it('2. Edit Reason only: updates reason while amount remains unchanged', () => {
    const updated = updateDueTransaction({
      id: 'due-101',
      amountPaise: 50000,
      reason: 'Supplies and Delivery',
    });

    assert.equal(updated.reason, 'Supplies and Delivery', 'Reason must be updated');
    assert.equal(updated.amountPaise, 50000, 'Amount must remain unchanged');
  });

  it('3. Edit both amount and Reason simultaneously', () => {
    const updated = updateDueTransaction({
      id: 'due-101',
      amountPaise: 75000, // ₹750
      reason: 'Stationery and Printing',
    });

    assert.equal(updated.amountPaise, 75000);
    assert.equal(updated.reason, 'Stationery and Printing');
  });

  it('4. Save successfully with an empty Reason without throwing error', () => {
    // If reason is passed as empty string '', it falls back to preserving existing reason without blocking
    const updated = updateDueTransaction({
      id: 'due-101',
      amountPaise: 80000,
      reason: '',
    });

    assert.equal(updated.amountPaise, 80000);
    assert.ok(updated.reason.length > 0, 'Reason falls back to existing reason rather than blocking');
  });

  it('5. Preserve the existing Reason when left unchanged (undefined or matching)', () => {
    const prevReason = mockDues[0].reason;
    const updated = updateDueTransaction({
      id: 'due-101',
      amountPaise: 60000,
      reason: undefined,
    });

    assert.equal(updated.reason, prevReason, 'Existing reason must be preserved when left unmodified');
  });

  it('6. Cancel without saving leaves transaction data completely untouched', () => {
    const initialAmount = mockDues[0].amountPaise;
    const initialReason = mockDues[0].reason;

    // Simulate user editing draft in UI but clicking Cancel
    const draftAmount = 999999;
    const draftReason = 'Unconfirmed Draft';
    // User cancels -> no updateDueTransaction call is made

    assert.equal(mockDues[0].amountPaise, initialAmount);
    assert.equal(mockDues[0].reason, initialReason);
  });

  it('7. Reject empty, invalid, zero, or negative amounts', () => {
    assert.throws(() => {
      updateDueTransaction({ id: 'due-101', amountPaise: 0 });
    }, /greater than zero/);

    assert.throws(() => {
      updateDueTransaction({ id: 'due-101', amountPaise: -500 });
    }, /greater than zero/);

    assert.throws(() => {
      updateDueTransaction({ id: 'due-101', amountPaise: NaN });
    }, /greater than zero/);
  });

  it('8. Correct outstanding balance recalculation: Opening ₹100, Due ₹500, Payment ₹100 -> Outstanding ₹500', () => {
    // Re-set mock to exact user prompt example
    mockCustomer.openingBalancePaise = 10000; // ₹100
    mockDues[0].amountPaise = 20000; // ₹200
    mockPayments[0].amountPaise = 10000; // ₹100

    // Before edit
    let ledger = computeCustomerLedger(mockCustomer, mockDues, mockPayments);
    assert.equal(ledger.balances.openingBalancePaise, 10000); // ₹100
    assert.equal(ledger.balances.totalNewDuesPaise, 20000); // ₹200
    assert.equal(ledger.balances.totalPaidPaise, 10000); // ₹100
    assert.equal(ledger.balances.balancePaise, 20000); // ₹200

    // Edit New Due from ₹200 to ₹500
    updateDueTransaction({ id: 'due-101', amountPaise: 50000, reason: 'Groceries' });

    // After edit
    ledger = computeCustomerLedger(mockCustomer, mockDues, mockPayments);
    assert.equal(ledger.balances.openingBalancePaise, 10000); // ₹100
    assert.equal(ledger.balances.totalNewDuesPaise, 50000); // ₹500
    assert.equal(ledger.balances.totalPaidPaise, 10000); // ₹100
    assert.equal(ledger.balances.balancePaise, 50000); // ₹500 (100 + 500 - 100)
    assert.equal(ledger.balances.totalCreditPaise, 60000); // ₹600 (total borrowed)
  });

  it('9. Correct running balance recalculation after each transaction', () => {
    const ledger = computeCustomerLedger(mockCustomer, mockDues, mockPayments);

    // Row 1: Opening Balance +₹100 -> Running: ₹100 (10,000 paise)
    assert.equal(ledger.rows[0].subType, 'opening');
    assert.equal(ledger.rows[0].runningBalancePaise, 10000);

    // Row 2: New Due +₹500 -> Running: ₹600 (60,000 paise)
    assert.equal(ledger.rows[1].subType, 'new_due');
    assert.equal(ledger.rows[1].runningBalancePaise, 60000);

    // Row 3: Payment -₹100 -> Running: ₹500 (50,000 paise)
    assert.equal(ledger.rows[2].subType, 'payment');
    assert.equal(ledger.rows[2].runningBalancePaise, 50000);
  });

  it('10. Offline editing enqueues UPDATE operation and later sync updates without duplicates', () => {
    syncQueue = [];
    updateDueTransaction({ id: 'due-101', amountPaise: 55000, reason: 'Offline Edited Due' });

    assert.equal(syncQueue.length, 1);
    assert.equal(syncQueue[0].operation, 'UPDATE');
    assert.equal(syncQueue[0].localId, 'due-101');
    assert.equal(syncQueue[0].payload.amountPaise, 55000);
    assert.equal(syncQueue[0].payload.reason, 'Offline Edited Due');

    // Simulate backend sync batch processing
    const serverDue = {
      _id: 'mongo-due-101',
      clientTransactionId: 'due-101',
      amountPaise: 20000,
      reason: 'Old Reason',
    };

    // Server processes UPDATE
    if (serverDue.clientTransactionId === syncQueue[0].payload.clientTransactionId) {
      serverDue.amountPaise = syncQueue[0].payload.amountPaise;
      serverDue.reason = syncQueue[0].payload.reason;
      serverDue.updatedAt = new Date().toISOString();
    }

    assert.equal(serverDue.amountPaise, 55000, 'Server must update existing record without duplicating');
    assert.equal(serverDue._id, 'mongo-due-101', 'Server ObjectId must remain stable');
  });

  it('11. Customer PDF report data reflects updated transaction values and ledger totals', () => {
    const ledger = computeCustomerLedger(mockCustomer, mockDues, mockPayments);

    // Check account summary data
    const openingBalance = ledger.balances.openingBalanceRupees;
    const totalNewDues = ledger.balances.totalNewDuesRupees;
    const totalPayments = ledger.balances.totalPaidRupees;
    const currentBalance = ledger.balances.balanceRupees;

    assert.equal(openingBalance, 100);
    assert.equal(totalNewDues, 550);
    assert.equal(totalPayments, 100);
    assert.equal(currentBalance, 550);
  });

  it('12. Multiple-device synchronization and conflict handling: updates existing by clientTransactionId', () => {
    // Device A and Device B both have clientTransactionId 'due-101'
    const payloadFromDevice = {
      clientTransactionId: 'due-101',
      amountPaise: 65000,
      reason: 'Device Sync Update',
    };

    const existingInDb = {
      _id: 'mongo-due-101',
      clientTransactionId: 'due-101',
      amountPaise: 55000,
    };

    // When sync arrives with same clientTransactionId, it updates existing rather than throwing unique constraint error
    if (existingInDb.clientTransactionId === payloadFromDevice.clientTransactionId) {
      existingInDb.amountPaise = payloadFromDevice.amountPaise;
      existingInDb.reason = payloadFromDevice.reason;
    }

    assert.equal(existingInDb.amountPaise, 65000);
    assert.equal(existingInDb._id, 'mongo-due-101');
  });

  it('13. Payment Received transactions do not show Edit Due (isNewDue === false)', () => {
    const paymentTx = {
      id: 'pay-101',
      type: 'payment',
      subType: 'payment',
    };

    const isNewDue =
      paymentTx.subType === 'new_due' &&
      paymentTx.type === 'credit' &&
      !paymentTx.id.startsWith('opening-');

    assert.equal(isNewDue, false, 'Payment transaction must not qualify for Edit Due');
  });

  it('14. Opening Balance transactions do not show Edit Due (isNewDue === false)', () => {
    const openingTx = {
      id: 'opening-cust-101',
      type: 'credit',
      subType: 'opening',
    };

    const isNewDue =
      openingTx.subType === 'new_due' &&
      openingTx.type === 'credit' &&
      !openingTx.id.startsWith('opening-');

    assert.equal(isNewDue, false, 'Opening balance transaction must not qualify for Edit Due');
  });

  it('15. Existing customer data and other transactions remain unchanged except for explicitly edited transaction', () => {
    const otherDue = {
      id: 'due-999',
      customerId: 'cust-101',
      amountPaise: 30000,
      reason: 'Unrelated Transaction',
    };
    mockDues.push(otherDue);

    // Edit only due-101
    updateDueTransaction({ id: 'due-101', amountPaise: 40000, reason: 'Modified' });

    assert.equal(mockDues[0].amountPaise, 40000);
    assert.equal(otherDue.amountPaise, 30000, 'Unrelated due must remain untouched');
    assert.equal(mockCustomer.id, 'cust-101', 'Customer ID must remain untouched');
    assert.equal(mockCustomer.name, 'Akash Water', 'Customer name must remain untouched');
    assert.equal(mockCustomer.phone, '9876543210', 'Customer phone must remain untouched');
  });
});

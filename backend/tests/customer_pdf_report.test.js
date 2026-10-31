import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// Helper to convert paise to rupees
function paiseToRupees(paise) {
  return (paise || 0) / 100;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateCustomerReportHtml(data, businessName = 'Hisab Money') {
  const {
    customer,
    periodLabel,
    periodOpeningPaise,
    periodDuesPaise,
    periodPaidPaise,
    closingBalancePaise,
    isCleared,
    rows,
  } = data;

  const openingRupees = paiseToRupees(periodOpeningPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const duesRupees = paiseToRupees(periodDuesPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const paidRupees = paiseToRupees(periodPaidPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 });
  const closingRupees = paiseToRupees(Math.abs(closingBalancePaise)).toLocaleString('en-IN', { minimumFractionDigits: 2 });

  const rowsHtml = rows
    .map((r) => {
      const amtStr = paiseToRupees(r.amountPaise).toLocaleString('en-IN', { minimumFractionDigits: 2 });
      const balStr = paiseToRupees(r.runningBalancePaise).toLocaleString('en-IN', { minimumFractionDigits: 2 });
      return `
        <tr>
          <td>${r.index}</td>
          <td>${r.date}</td>
          <td><span class="badge ${r.isOpening ? 'badge-opening' : (r.isDue ? 'badge-due' : 'badge-paid')}">${escapeHtml(r.typeLabel)}</span></td>
          <td>${escapeHtml(r.description)}</td>
          <td>${r.isDue ? '+' : '-'}₹${amtStr}</td>
          <td>₹${balStr}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Ledger Statement - ${escapeHtml(customer.name)}</title>
      <style>
        @page {
          size: A4 portrait;
          margin: 14mm 12mm 14mm 12mm;
        }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
        tr { page-break-inside: avoid; }
        .badge-opening { background: #fef3c7; color: #b45309; }
        .badge-due { background: #ffedd5; color: #c2410c; }
        .badge-paid { background: #dcfce7; color: #15803d; }
      </style>
    </head>
    <body>
      <div class="brand-title">${escapeHtml(businessName)}</div>
      <div class="cust-title">${escapeHtml(customer.name)}</div>
      <div class="cust-phone">${customer.phone}</div>
      <div class="cust-addr">${escapeHtml(customer.address || '')}</div>
      <table>
        <thead>
          <tr>
            <th style="width: 25px; text-align: center;">#</th>
            <th style="width: 85px;">Date & Time</th>
            <th style="width: 100px;">Type</th>
            <th>Description / Reason</th>
            <th style="text-align: right; width: 85px;">Amount</th>
            <th style="text-align: right; width: 125px; font-size: 9px; letter-spacing: 0.3px; white-space: nowrap;">TOTAL CURRENT BALANCE</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td colspan="4">Period Statement Totals:</td>
            <td>+₹${duesRupees}</td>
            <td>₹${closingRupees}</td>
          </tr>
        </tfoot>
      </table>
    </body>
    </html>
  `;
}

// Mirror CustomerPdfReportService ledger calculation logic
function processLedgerData(customer, transactions, options) {
  const now = options.now ? new Date(options.now) : new Date();

  let start = null;
  let end = null;
  let periodLabel = 'All Time';

  if (options.filter === 'this_month') {
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    periodLabel = 'This Month';
  } else if (options.filter === 'custom' && options.customStartDate && options.customEndDate) {
    start = new Date(options.customStartDate);
    start.setHours(0, 0, 0, 0);
    end = new Date(options.customEndDate);
    end.setHours(23, 59, 59, 999);
    periodLabel = 'Custom Range';
  }

  // Ensure customer opening balance transaction is included if customer has opening balance
  const custOpeningPaise =
    customer.openingBalancePaise ??
    (customer.openingBalance ? Math.round(customer.openingBalance * 100) : 0);

  const hasOpeningInTx = transactions.some((t) => t.subType === 'opening');

  const allTransactions = [...transactions];
  if (!hasOpeningInTx && custOpeningPaise > 0) {
    allTransactions.push({
      id: `opening-${customer.id}`,
      customerId: customer.id,
      customerName: customer.name,
      type: 'credit',
      subType: 'opening',
      amountPaise: custOpeningPaise,
      amount: custOpeningPaise / 100,
      balanceAfterPaise: custOpeningPaise,
      balanceAfter: custOpeningPaise / 100,
      reason: customer.initialDueReason || 'Opening Balance',
      notes: customer.notes || 'Opening Balance',
      createdAt: customer.createdAt,
    });
  }

  // Sort ascending chronologically (oldest first)
  const sorted = allTransactions.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  let runningPaise = 0;
  let periodOpeningPaise = 0;
  let periodDuesPaise = 0;
  let periodPaidPaise = 0;
  const rows = [];

  for (const t of sorted) {
    const tDate = new Date(t.createdAt);
    const tTime = tDate.getTime();
    const isDue = t.type === 'credit';
    const isOpening = t.subType === 'opening';
    const amountPaise = t.amountPaise ?? Math.round((t.amount || 0) * 100);

    // Prior to period
    if (start && tTime < start.getTime()) {
      if (isDue) {
        runningPaise += amountPaise;
      } else {
        runningPaise -= amountPaise;
      }
      periodOpeningPaise = runningPaise;
      continue;
    }

    // After period
    if (end && tTime > end.getTime()) {
      continue;
    }

    // Inside period
    if (isOpening) {
      runningPaise += amountPaise;
      periodOpeningPaise += amountPaise;
    } else if (isDue) {
      runningPaise += amountPaise;
      periodDuesPaise += amountPaise;
    } else {
      runningPaise -= amountPaise;
      periodPaidPaise += amountPaise;
    }

    let typeLabel = isDue ? 'Due' : 'Payment';
    if (isOpening) {
      typeLabel = 'Opening Balance';
    } else if (isDue) {
      typeLabel = 'New Due';
    } else {
      typeLabel = 'Payment Received';
    }

    rows.push({
      index: rows.length + 1,
      date: t.createdAt,
      typeLabel,
      isDue,
      isOpening,
      description: t.reason || t.notes || (isOpening ? 'Opening Balance' : isDue ? 'Due' : 'Payment'),
      paymentMethod: t.paymentMethod,
      amountPaise,
      runningBalancePaise: runningPaise,
    });
  }

  const closingBalancePaise = runningPaise;
  const isCleared = closingBalancePaise <= 0;

  return {
    customer,
    periodLabel,
    periodOpeningPaise,
    periodDuesPaise,
    periodPaidPaise,
    closingBalancePaise,
    isCleared,
    rows,
  };
}

describe('Customer-wise PDF Ledger Report Tests', () => {
  const mockCustomerWithOB = {
    id: 'c-101',
    name: 'Akash Water 2',
    phone: '9732325993',
    address: 'Mallarpur',
    notes: 'Reason: Groceries',
    openingBalancePaise: 200000, // ₹2,000.00
    createdAt: '2026-10-31T09:47:00.000Z',
  };

  const mockCustomerZeroOB = {
    id: 'c-102',
    name: 'Rohit Sharma',
    phone: '9876543210',
    address: 'Kolkata',
    notes: '',
    openingBalancePaise: 0,
    createdAt: '2026-10-31T09:00:00.000Z',
  };

  it('1. Opening Balance only: reports Opening Balance ₹2000, New Dues ₹0, Payments ₹0, Closing ₹2000', () => {
    const data = processLedgerData(mockCustomerWithOB, [], { filter: 'all' });

    assert.equal(data.periodOpeningPaise, 200000, 'Opening Balance must be ₹2,000');
    assert.equal(data.periodDuesPaise, 0, 'Total New Dues must be ₹0');
    assert.equal(data.periodPaidPaise, 0, 'Total Payments must be ₹0');
    assert.equal(data.closingBalancePaise, 200000, 'Closing balance must be ₹2,000');
    assert.equal(data.isCleared, false);
    assert.equal(data.rows.length, 1);
    assert.equal(data.rows[0].typeLabel, 'Opening Balance');
    assert.equal(data.rows[0].amountPaise, 200000);
    assert.equal(data.rows[0].runningBalancePaise, 200000);
  });

  it('2. Normal New Due only: reports Opening Balance ₹0, New Dues ₹2000, Payments ₹0, Closing ₹2000', () => {
    const duesOnly = [
      {
        id: 'due-1',
        customerId: 'c-102',
        type: 'credit',
        subType: 'new_due',
        amountPaise: 200000, // ₹2,000
        reason: 'Monthly Milk supply',
        createdAt: '2026-10-31T10:00:00.000Z',
      },
    ];

    const data = processLedgerData(mockCustomerZeroOB, duesOnly, { filter: 'all' });

    assert.equal(data.periodOpeningPaise, 0, 'Opening Balance must be ₹0');
    assert.equal(data.periodDuesPaise, 200000, 'Total New Dues must be ₹2,000');
    assert.equal(data.periodPaidPaise, 0, 'Total Payments must be ₹0');
    assert.equal(data.closingBalancePaise, 200000, 'Closing balance must be ₹2,000');
    assert.equal(data.rows.length, 1);
    assert.equal(data.rows[0].typeLabel, 'New Due');
    assert.equal(data.rows[0].amountPaise, 200000);
    assert.equal(data.rows[0].runningBalancePaise, 200000);
  });

  it('3. Opening Balance + New Due: distinguishes Opening Balance from New Dues', () => {
    const txns = [
      {
        id: 'due-new',
        customerId: 'c-101',
        type: 'credit',
        subType: 'new_due',
        amountPaise: 50000, // ₹500 new due
        reason: 'Extra goods',
        createdAt: '2026-10-31T11:00:00.000Z',
      },
    ];

    const data = processLedgerData(mockCustomerWithOB, txns, { filter: 'all' });

    assert.equal(data.periodOpeningPaise, 200000, 'Opening Balance must be ₹2,000');
    assert.equal(data.periodDuesPaise, 50000, 'New Dues must be ₹500 (not mixed with opening)');
    assert.equal(data.closingBalancePaise, 250000, 'Total closing balance must be ₹2,500');
    assert.equal(data.rows.length, 2);
    assert.equal(data.rows[0].typeLabel, 'Opening Balance');
    assert.equal(data.rows[0].runningBalancePaise, 200000);
    assert.equal(data.rows[1].typeLabel, 'New Due');
    assert.equal(data.rows[1].runningBalancePaise, 250000);
  });

  it('4. Opening Balance + Partial Payment (User screenshot case): Opening ₹2000, New Dues ₹0, Payments ₹1000, Closing ₹1000', () => {
    const txns = [
      {
        id: 'opening-c-101',
        customerId: 'c-101',
        type: 'credit',
        subType: 'opening',
        amountPaise: 200000,
        amount: 2000,
        reason: 'Opening Balance',
        createdAt: '2026-10-31T09:47:00.000Z',
      },
      {
        id: 'pay-1',
        customerId: 'c-101',
        type: 'payment',
        subType: 'payment',
        amountPaise: 100000, // ₹1,000.00
        amount: 1000,
        paymentMethod: 'UPI',
        reason: 'Payment via UPI',
        createdAt: '2026-10-31T09:50:00.000Z',
      },
    ];

    const data = processLedgerData(mockCustomerWithOB, txns, { filter: 'all' });

    assert.equal(data.periodOpeningPaise, 200000, 'Opening Balance must be ₹2,000');
    assert.equal(data.periodDuesPaise, 0, 'Total New Dues must be ₹0 (NEVER ₹2,000)');
    assert.equal(data.periodPaidPaise, 100000, 'Total Payments must be ₹1,000');
    assert.equal(data.closingBalancePaise, 100000, 'Outstanding Due must be ₹1,000');
    assert.equal(data.isCleared, false);
    assert.equal(data.rows.length, 2);
    assert.equal(data.rows[0].typeLabel, 'Opening Balance');
    assert.equal(data.rows[0].runningBalancePaise, 200000);
    assert.equal(data.rows[1].typeLabel, 'Payment Received');
    assert.equal(data.rows[1].runningBalancePaise, 100000);
  });

  it('5. Multiple payments: correctly aggregates partial CASH and UPI payments', () => {
    const multiPayments = [
      {
        id: 'pay-cash',
        customerId: 'c-101',
        type: 'payment',
        subType: 'payment',
        amountPaise: 50000, // ₹500
        paymentMethod: 'CASH',
        createdAt: '2026-10-31T10:00:00.000Z',
      },
      {
        id: 'pay-upi',
        customerId: 'c-101',
        type: 'payment',
        subType: 'payment',
        amountPaise: 70000, // ₹700
        paymentMethod: 'UPI',
        createdAt: '2026-10-31T11:00:00.000Z',
      },
    ];

    const data = processLedgerData(mockCustomerWithOB, multiPayments, { filter: 'all' });

    assert.equal(data.periodOpeningPaise, 200000);
    assert.equal(data.periodDuesPaise, 0);
    assert.equal(data.periodPaidPaise, 120000); // ₹1,200 total paid
    assert.equal(data.closingBalancePaise, 80000); // ₹800 remaining
    assert.equal(data.rows.length, 3);
    assert.equal(data.rows[1].paymentMethod, 'CASH');
    assert.equal(data.rows[2].paymentMethod, 'UPI');
  });

  it('6. Fully cleared customer: flags status as All Cleared when closing balance is 0', () => {
    const fullPay = [
      {
        id: 'pay-full',
        customerId: 'c-101',
        type: 'payment',
        subType: 'payment',
        amountPaise: 200000, // ₹2,000
        createdAt: '2026-10-31T12:00:00.000Z',
      },
    ];

    const data = processLedgerData(mockCustomerWithOB, fullPay, { filter: 'all' });

    assert.equal(data.closingBalancePaise, 0);
    assert.equal(data.isCleared, true, 'isCleared must be true when balance reaches zero');
    assert.equal(data.rows[1].runningBalancePaise, 0);
  });

  it('7. All Time and Custom Date Range reports: correctly handles prior balances without double counting', () => {
    const multiDateTxns = [
      { id: 't-sep-due', type: 'credit', subType: 'new_due', amountPaise: 40000, createdAt: '2026-09-10T10:00:00.000Z' },
      { id: 't-sep-pay', type: 'payment', subType: 'payment', amountPaise: 10000, createdAt: '2026-09-15T10:00:00.000Z' },
      { id: 't-oct-due', type: 'credit', subType: 'new_due', amountPaise: 50000, createdAt: '2026-10-05T10:00:00.000Z' },
    ];

    // Filter for October
    const data = processLedgerData(mockCustomerZeroOB, multiDateTxns, {
      filter: 'custom',
      customStartDate: new Date('2026-10-01T00:00:00.000Z'),
      customEndDate: new Date('2026-10-31T23:59:59.999Z'),
    });

    assert.equal(data.periodOpeningPaise, 30000, 'Sept balance (400 - 100 = 300) rolled into Oct opening');
    assert.equal(data.periodDuesPaise, 50000, 'Only Oct due included in periodDuesPaise');
    assert.equal(data.closingBalancePaise, 80000);
    assert.equal(data.rows.length, 1);
  });

  it('8. Correct running balance in every transaction row', () => {
    const sequentialTxns = [
      { id: 'tx-1', type: 'credit', subType: 'new_due', amountPaise: 10000, createdAt: '2026-10-01T10:00:00.000Z' },
      { id: 'tx-2', type: 'credit', subType: 'new_due', amountPaise: 20000, createdAt: '2026-10-02T10:00:00.000Z' },
      { id: 'tx-3', type: 'payment', subType: 'payment', amountPaise: 15000, createdAt: '2026-10-03T10:00:00.000Z' },
      { id: 'tx-4', type: 'credit', subType: 'new_due', amountPaise: 5000, createdAt: '2026-10-04T10:00:00.000Z' },
    ];

    const data = processLedgerData(mockCustomerZeroOB, sequentialTxns, { filter: 'all' });

    assert.equal(data.rows[0].runningBalancePaise, 10000);
    assert.equal(data.rows[1].runningBalancePaise, 30000);
    assert.equal(data.rows[2].runningBalancePaise, 15000);
    assert.equal(data.rows[3].runningBalancePaise, 20000);
    assert.equal(data.closingBalancePaise, 20000);
  });

  it('9. TOTAL CURRENT BALANCE heading visibility and layout in generated HTML', () => {
    const data = processLedgerData(mockCustomerWithOB, [], { filter: 'all' });
    const html = generateCustomerReportHtml(data, 'Hisab Money');

    // Ensure the new column heading exists and old heading is updated
    assert.match(html, /TOTAL CURRENT BALANCE/, 'Must contain renamed heading TOTAL CURRENT BALANCE');
    assert.match(html, /@page\s*\{\s*size:\s*A4 portrait;/i, 'Must define A4 portrait page size');
    assert.match(html, /thead\s*\{\s*display:\s*table-header-group;\s*\}/i, 'Must repeat table headers across pages');
    assert.match(html, /tr\s*\{\s*page-break-inside:\s*avoid;\s*\}/i, 'Must avoid breaking rows across pages');
    assert.match(html, /badge-opening/, 'Must include styling class for opening balance badge');
  });

  it('10. Handles multilingual text (Bengali, Hindi, English) with UTF-8 support', () => {
    const multilingualCust = {
      id: 'c-multi',
      name: 'অনিতা শর্মা (अनिता शर्मा)',
      phone: '9876543210',
      address: 'कोलकाता (কলকাতা)',
      notes: 'মুদি সামগ্রী / किराना सामान',
      openingBalancePaise: 50000,
      createdAt: '2026-10-31T09:00:00.000Z',
    };

    const multiTxns = [
      {
        id: 't-bn',
        type: 'credit',
        amountPaise: 50000,
        reason: 'ঔষধ ক্রয় (दवा खरीद)',
        createdAt: '2026-10-31T09:05:00.000Z',
      },
    ];

    const processed = processLedgerData(multilingualCust, multiTxns, { filter: 'all' });
    const html = generateCustomerReportHtml(processed, 'হিসাব মানি (Hisab Money)');

    assert.match(html, /<meta charset="utf-8">/i, 'Must enforce UTF-8 charset');
    assert.match(html, /অনিতা শর্মা/, 'Must render Bengali name');
    assert.match(html, /अनिता शर्मा/, 'Must render Hindi name');
    assert.match(html, /ঔষধ ক্রয়/, 'Must render Bengali description');
    assert.match(html, /दवा खरीद/, 'Must render Hindi description');
  });

  it('11. Supports long histories with 100+ transactions without overflow or calculation drift', () => {
    const largeTxns = [];
    let expectedPaise = 0;

    for (let i = 1; i <= 100; i++) {
      const isDue = i % 2 !== 0;
      const amt = 10000; // ₹100
      if (isDue) expectedPaise += amt;
      else expectedPaise -= amt;

      largeTxns.push({
        id: `tx-${i}`,
        type: isDue ? 'credit' : 'payment',
        amountPaise: amt,
        reason: `Item #${i}`,
        createdAt: new Date(2026, 0, i, 10, 0, 0).toISOString(),
      });
    }

    const processed = processLedgerData(mockCustomerZeroOB, largeTxns, { filter: 'all' });
    assert.equal(processed.rows.length, 100);
    assert.equal(processed.closingBalancePaise, expectedPaise);
    assert.equal(processed.rows[99].index, 100);
  });
});

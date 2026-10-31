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
          <td>${escapeHtml(r.typeLabel)}</td>
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
      </style>
    </head>
    <body>
      <div class="brand-title">${escapeHtml(businessName)}</div>
      <div class="cust-title">${escapeHtml(customer.name)}</div>
      <div class="cust-phone">${customer.phone}</div>
      <div class="cust-addr">${escapeHtml(customer.address || '')}</div>
      <table>
        <thead><tr><th>#</th><th>Date</th><th>Type</th><th>Desc</th><th>Amt</th><th>Bal</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
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

  // Sort ascending chronologically (oldest first)
  const sorted = [...transactions].sort(
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
    if (isDue) {
      runningPaise += amountPaise;
      periodDuesPaise += amountPaise;
    } else {
      runningPaise -= amountPaise;
      periodPaidPaise += amountPaise;
    }

    rows.push({
      index: rows.length + 1,
      date: t.createdAt,
      typeLabel: isDue ? (t.subType === 'opening' ? 'Opening Balance' : 'Due Added') : 'Payment Received',
      isDue,
      description: t.reason || t.notes || (isDue ? 'Due' : 'Payment'),
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
  const mockCustomer = {
    id: 'c-101',
    name: 'Anitan',
    phone: '8535967828',
    address: 'Mallarpur',
    notes: 'Reason: Groceries',
    openingBalancePaise: 100000, // ₹1,000.00
    createdAt: '2026-10-31T09:47:00.000Z',
  };

  const mockTransactions = [
    {
      id: 'opening-c-101',
      customerId: 'c-101',
      type: 'credit',
      subType: 'opening',
      amountPaise: 100000,
      amount: 1000,
      reason: 'Opening Balance: Reason: Groceries',
      createdAt: '2026-10-31T09:47:00.000Z',
    },
    {
      id: 'pay-1',
      customerId: 'c-101',
      type: 'payment',
      subType: 'payment',
      amountPaise: 50000, // ₹500.00
      amount: 500,
      paymentMethod: 'CASH',
      reason: 'Payment via CASH',
      createdAt: '2026-10-31T09:48:00.000Z',
    },
    {
      id: 'pay-2',
      customerId: 'c-101',
      type: 'payment',
      subType: 'payment',
      amountPaise: 50000, // ₹500.00
      amount: 500,
      paymentMethod: 'UPI',
      reason: 'Payment via UPI',
      createdAt: '2026-10-31T09:48:30.000Z',
    },
  ];

  it('1. Calculates exact ledger totals with Opening Balance and Partial Payments', () => {
    const data = processLedgerData(mockCustomer, mockTransactions, { filter: 'all' });

    assert.equal(data.rows.length, 3, 'All 3 transactions must be included');
    // Row 1: Opening +₹1000 -> Running: ₹1000
    assert.equal(data.rows[0].amountPaise, 100000);
    assert.equal(data.rows[0].runningBalancePaise, 100000);
    assert.equal(data.rows[0].isDue, true);

    // Row 2: Payment CASH -₹500 -> Running: ₹500
    assert.equal(data.rows[1].amountPaise, 50000);
    assert.equal(data.rows[1].runningBalancePaise, 50000);
    assert.equal(data.rows[1].isDue, false);
    assert.equal(data.rows[1].paymentMethod, 'CASH');

    // Row 3: Payment UPI -₹500 -> Running: ₹0
    assert.equal(data.rows[2].amountPaise, 50000);
    assert.equal(data.rows[2].runningBalancePaise, 0);
    assert.equal(data.rows[2].isDue, false);
    assert.equal(data.rows[2].paymentMethod, 'UPI');

    // Final balance
    assert.equal(data.closingBalancePaise, 0);
    assert.equal(data.isCleared, true, 'Status must be All Cleared when balance is 0');
  });

  it('2. Correctly flags accounts with pending dues', () => {
    // Only 1 partial payment of ₹500 against ₹1000 opening
    const partialTxns = mockTransactions.slice(0, 2);
    const data = processLedgerData(mockCustomer, partialTxns, { filter: 'all' });

    assert.equal(data.closingBalancePaise, 50000); // ₹500 pending
    assert.equal(data.isCleared, false, 'Must be marked as Due Pending');
  });

  it('3. Computes running balance across New Dues and Payments sequentially', () => {
    const extendedTxns = [
      ...mockTransactions,
      {
        id: 'due-2',
        customerId: 'c-101',
        type: 'credit',
        subType: 'new_due',
        amountPaise: 25000, // +₹250
        amount: 250,
        reason: 'Medicine',
        createdAt: '2026-10-31T10:00:00.000Z',
      },
      {
        id: 'pay-3',
        customerId: 'c-101',
        type: 'payment',
        subType: 'payment',
        amountPaise: 10000, // -₹100
        amount: 100,
        paymentMethod: 'UPI',
        reason: 'Payment via UPI',
        createdAt: '2026-10-31T10:30:00.000Z',
      },
    ];

    const data = processLedgerData(mockCustomer, extendedTxns, { filter: 'all' });

    assert.equal(data.rows.length, 5);
    // After pay-2 balance was 0
    // Then due-2 adds 250 -> balance 250
    assert.equal(data.rows[3].runningBalancePaise, 25000);
    // Then pay-3 pays 100 -> balance 150
    assert.equal(data.rows[4].runningBalancePaise, 15000);
    assert.equal(data.closingBalancePaise, 15000);
    assert.equal(data.isCleared, false);
  });

  it('4. Filters by "This Month" accurately rolling prior transactions into period opening balance', () => {
    const multiMonthTxns = [
      {
        id: 'due-sep',
        customerId: 'c-101',
        type: 'credit',
        amountPaise: 40000, // ₹400 in Sept
        createdAt: '2026-09-15T10:00:00.000Z',
      },
      {
        id: 'pay-sep',
        customerId: 'c-101',
        type: 'payment',
        amountPaise: 10000, // ₹100 paid in Sept -> ₹300 rolled over to Oct
        createdAt: '2026-09-20T10:00:00.000Z',
      },
      {
        id: 'due-oct',
        customerId: 'c-101',
        type: 'credit',
        amountPaise: 50000, // ₹500 in Oct
        createdAt: '2026-10-05T10:00:00.000Z',
      },
    ];

    const data = processLedgerData(mockCustomer, multiMonthTxns, {
      filter: 'this_month',
      now: '2026-10-31T12:00:00.000Z',
    });

    // Opening balance rolled over from September
    assert.equal(data.periodOpeningPaise, 30000, 'Period opening balance must reflect balance before Oct 1');
    // Rows in October
    assert.equal(data.rows.length, 1);
    assert.equal(data.rows[0].amountPaise, 50000);
    assert.equal(data.rows[0].runningBalancePaise, 80000, 'Running balance must start from period opening');
    assert.equal(data.closingBalancePaise, 80000);
  });

  it('5. Filters by "Custom Date Range" correctly', () => {
    const txns = [
      { id: 't1', type: 'credit', amountPaise: 10000, createdAt: '2026-10-01T10:00:00.000Z' },
      { id: 't2', type: 'credit', amountPaise: 20000, createdAt: '2026-10-10T10:00:00.000Z' },
      { id: 't3', type: 'payment', amountPaise: 15000, createdAt: '2026-10-15T10:00:00.000Z' },
      { id: 't4', type: 'credit', amountPaise: 50000, createdAt: '2026-10-25T10:00:00.000Z' },
    ];

    // Select range Oct 05 to Oct 20
    const data = processLedgerData(mockCustomer, txns, {
      filter: 'custom',
      customStartDate: new Date('2026-10-05T00:00:00.000Z'),
      customEndDate: new Date('2026-10-20T23:59:59.999Z'),
    });

    assert.equal(data.periodOpeningPaise, 10000, 't1 prior to Oct 05 is period opening');
    assert.equal(data.rows.length, 2, 'Only t2 and t3 fall inside range');
    assert.equal(data.rows[0].runningBalancePaise, 30000); // 10000 + 20000
    assert.equal(data.rows[1].runningBalancePaise, 15000); // 30000 - 15000
    assert.equal(data.closingBalancePaise, 15000);
  });

  it('6. HTML structure includes repeated table header, avoid row break, and A4 page setup', () => {
    const processed = processLedgerData(mockCustomer, mockTransactions, { filter: 'all' });
    const html = generateCustomerReportHtml(processed, 'Hisab Money');

    assert.match(html, /@page\s*\{\s*size:\s*A4 portrait;/i, 'Must define A4 portrait page size');
    assert.match(html, /thead\s*\{\s*display:\s*table-header-group;\s*\}/i, 'Must repeat table headers across pages');
    assert.match(html, /tr\s*\{\s*page-break-inside:\s*avoid;\s*\}/i, 'Must avoid breaking rows across pages');
    assert.match(html, /Anitan/, 'Must include customer name');
    assert.match(html, /8535967828/, 'Must include customer phone');
    assert.match(html, /Mallarpur/, 'Must include customer address');
    assert.match(html, /Hisab Money/, 'Must include app branding');
  });

  it('7. Handles multilingual text (Bengali, Hindi, English) with UTF-8 support', () => {
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

  it('8. Supports long histories with 100+ transactions without overflow or calculation drift', () => {
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

    const processed = processLedgerData(mockCustomer, largeTxns, { filter: 'all' });
    assert.equal(processed.rows.length, 100);
    assert.equal(processed.closingBalancePaise, expectedPaise);
    assert.equal(processed.rows[99].index, 100);
  });
});

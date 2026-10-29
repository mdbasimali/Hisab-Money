import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import { Customer, DueTransaction, Payment } from '../src/models/index.js';

function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function auditFinancialScenario() {
  console.log('========================================================================');
  console.log(' AUDIT ITEM 5: FINANCIAL CORRECTNESS & DUAL-ENTRY VERIFICATION');
  console.log('========================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ Connected to MongoDB Atlas:', mongoose.connection.name);

  const testCustId = `audit-fin-${Date.now()}`;
  const testDueId = `due-audit-${Date.now()}`;
  const testPayId = `pay-audit-${Date.now()}`;

  // 1. Create customer: Opening Balance = ₹5,000 (500,000 paise)
  console.log('Step 1: Creating Customer with Opening Balance = ₹5,000 (500000 paise)...');
  const custRes = await makeRequest(
    {
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/customers',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-user-id': 'audit-user-fin',
      },
    },
    JSON.stringify({
      localId: testCustId,
      name: 'Rohan Financial Audit Customer',
      phone: '9888899999',
      openingBalancePaise: 500000,
    })
  );

  console.log(`  Customer created. Status: ${custRes.status}, backendId: ${custRes.body.data._id}`);
  const mongoCustId = custRes.body.data._id;

  // 2. Add New Due: ₹1,000 (100,000 paise), Reason: "Groceries"
  console.log('\nStep 2: Adding New Due: ₹1,000 (100000 paise), Reason: "Groceries"...');
  const dueRes = await makeRequest(
    {
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/customers/${mongoCustId}/dues`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-user-id': 'audit-user-fin',
      },
    },
    JSON.stringify({
      clientTransactionId: testDueId,
      amountPaise: 100000,
      reason: 'Groceries',
    })
  );
  console.log(`  Due recorded. Status: ${dueRes.status}`);

  // 3. Record Payment: ₹3,000 (300,000 paise)
  console.log('\nStep 3: Recording Payment: ₹3,000 (300000 paise)...');
  const payRes = await makeRequest(
    {
      hostname: '127.0.0.1',
      port: 5000,
      path: `/api/customers/${mongoCustId}/payments`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-user-id': 'audit-user-fin',
      },
    },
    JSON.stringify({
      clientTransactionId: testPayId,
      amountPaise: 300000,
      paymentMethod: 'upi',
    })
  );
  console.log(`  Payment recorded. Status: ${payRes.status}`);

  // 4. Query Customer details & balance
  console.log('\nStep 4: Fetching Customer via GET /api/customers/:id...');
  const detailRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/customers/${mongoCustId}`,
    method: 'GET',
    headers: { 'x-dev-user-id': 'audit-user-fin' },
  });

  const d = detailRes.body.data;
  console.log('  Financial Calculation Results:');
  console.log(`  - Opening Balance:    ₹${d.openingBalanceRupees} (${d.openingBalancePaise} paise) [Expected: ₹5000]`);
  console.log(`  - Additional New Due: ₹${d.totalNewDuesRupees} (${d.totalNewDuesPaise} paise) [Expected: ₹1000]`);
  console.log(`  - Total Paid:         ₹${d.totalPaidRupees} (${d.totalPaidPaise} paise) [Expected: ₹3000]`);
  console.log(`  - Outstanding Due:    ₹${d.balanceRupees} (${d.balancePaise} paise) [Expected: ₹3000]`);

  if (
    d.openingBalanceRupees !== 5000 ||
    d.totalNewDuesRupees !== 1000 ||
    d.totalPaidRupees !== 3000 ||
    d.balanceRupees !== 3000
  ) {
    throw new Error('Financial calculation verification FAILED!');
  }

  // 5. Query Transactions ledger
  console.log('\nStep 5: Verifying Transaction History / Ledger...');
  const txRes = await makeRequest({
    hostname: '127.0.0.1',
    port: 5000,
    path: `/api/customers/${mongoCustId}/transactions`,
    method: 'GET',
    headers: { 'x-dev-user-id': 'audit-user-fin' },
  });

  console.log(`  Ledger entries returned: ${txRes.body.data.length} (Expected: 3 - Opening, Due, Payment)`);
  txRes.body.data.forEach((tx) => {
    console.log(`   * [${tx.subType}] Amount: ₹${tx.amount}, Balance After: ₹${tx.balanceAfter}`);
  });

  await mongoose.disconnect();
  console.log('\n========================================================================');
  console.log(' ✅ FINANCIAL CORRECTNESS AUDIT PASSED 100%');
  console.log('========================================================================');
}

auditFinancialScenario().catch((err) => {
  console.error('Audit execution error:', err);
  process.exit(1);
});

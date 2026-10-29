import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import mongoose from 'mongoose';
import { Customer } from '../src/models/index.js';

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

async function testAutomaticSyncFlow() {
  console.log('=================================================================================');
  console.log(' AUTOMATIC SYNC & RETRY QUEUE VERIFICATION TEST (PHASE 3)');
  console.log('=================================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✔ [DB] Connected to MongoDB Atlas:', mongoose.connection.name);

  // ---------------------------------------------------------------------------
  // TEST 1: Online Automatic Sync
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 1: Create customer while online & verify automatic Atlas insertion ---');
  const onlineTestId = `auto-sync-cust-${Date.now()}`;
  const batchPayloadOnline = {
    items: [
      {
        localId: onlineTestId,
        entityType: 'customer',
        operation: 'CREATE',
        payload: {
          name: 'Sunita Sharma (Auto Synced)',
          phone: '9899112233',
          address: '45, Civil Lines, Jaipur',
          notes: 'Auto Sync Verification',
          openingBalancePaise: 120000, // ₹1,200.00
        },
      },
    ],
  };

  const sync1Res = await makeRequest(
    {
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/sync/batch',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-user-id': 'dev-user-1',
      },
    },
    JSON.stringify(batchPayloadOnline)
  );

  console.log('   - Batch Sync HTTP Status:', sync1Res.status);
  console.log('   - Server Processed Count:', sync1Res.body.processed);
  const backendId1 = sync1Res.body.data[0].backendId;
  console.log('   - Returned MongoDB ObjectId:', backendId1);

  // Verify directly in MongoDB Atlas
  const atlasCustomer1 = await Customer.findById(backendId1).lean();
  if (!atlasCustomer1 || atlasCustomer1.localId !== onlineTestId) {
    throw new Error('TEST 1 FAILED: Customer not saved in MongoDB Atlas!');
  }
  console.log(`   - Verified in Atlas: ${atlasCustomer1.name} (Opening: ₹${atlasCustomer1.openingBalancePaise / 100})`);
  console.log('   ✔ TEST 1 PASSED: Automatic sync succeeded and document verified in MongoDB Atlas.');

  // ---------------------------------------------------------------------------
  // TEST 2: Idempotent Retries & Duplicate Prevention
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 2: Retry synchronization multiple times (Idempotency Check) ---');
  // Send the same customer 3 times in a row
  for (let i = 1; i <= 3; i++) {
    const retryRes = await makeRequest(
      {
        hostname: '127.0.0.1',
        port: 5000,
        path: '/api/sync/batch',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-dev-user-id': 'dev-user-1',
        },
      },
      JSON.stringify(batchPayloadOnline)
    );
    console.log(`   - Attempt #${i} status: ${retryRes.status}, backendId: ${retryRes.body.data[0].backendId}`);
  }

  // Count documents in MongoDB Atlas for onlineTestId
  const countInAtlas = await Customer.countDocuments({ localId: onlineTestId });
  console.log(`   - Total count in MongoDB Atlas for localId ${onlineTestId}: ${countInAtlas}`);
  if (countInAtlas !== 1) {
    throw new Error(`TEST 2 FAILED: Expected 1 document in Atlas, but found ${countInAtlas}`);
  }
  console.log('   ✔ TEST 2 PASSED: Idempotency guaranteed. Exactly 1 document exists in Atlas after 3 retries.');

  // ---------------------------------------------------------------------------
  // TEST 3: Validation Error / Partial Failure Handling
  // ---------------------------------------------------------------------------
  console.log('\n--- TEST 3: Validation failure simulation ---');
  const invalidBatch = {
    items: [
      {
        localId: 'invalid-cust-1',
        entityType: 'customer',
        operation: 'CREATE',
        payload: {
          name: '', // Empty name triggers validation failure
          openingBalancePaise: -50,
        },
      },
    ],
  };

  const invalidRes = await makeRequest(
    {
      hostname: '127.0.0.1',
      port: 5000,
      path: '/api/sync/batch',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-dev-user-id': 'dev-user-1',
      },
    },
    JSON.stringify(invalidBatch)
  );

  console.log('   - Invalid Batch Response:', invalidRes.body.data[0]);
  if (invalidRes.body.data[0].status !== 'ERROR') {
    throw new Error('TEST 3 FAILED: Expected ERROR status on invalid input');
  }
  console.log('   ✔ TEST 3 PASSED: Errors caught safely per item without crashing the sync worker.');

  await mongoose.disconnect();
  console.log('\n=================================================================================');
  console.log(' ALL AUTOMATIC SYNC TESTS COMPLETED SUCCESSFULLY');
  console.log('=================================================================================');
}

testAutomaticSyncFlow().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});

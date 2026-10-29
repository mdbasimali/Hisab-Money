import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { Customer, DueTransaction, Payment, User } from '../src/models/index.js';

let mongod;
let app;

describe('Hisab Khata Backend API Tests', () => {
  before(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    app = createApp();
  });

  after(async () => {
    await mongoose.disconnect();
    if (mongod) {
      await mongod.stop();
    }
  });

  describe('Health Endpoint', () => {
    it('GET /api/health returns 200 and healthy status', async () => {
      const res = await request(app).get('/api/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'healthy');
      assert.ok(
        res.body.service === 'Hisab Money API' || res.body.service === 'Paisa Khata API',
        `Unexpected service: ${res.body.service}`
      );
    });
  });

  describe('Customer CRUD & Validation', () => {
    it('POST /api/customers creates a new customer with opening balance in paise', async () => {
      const payload = {
        name: 'Rohan Sharma',
        phone: '9876543210',
        address: 'MG Road, Bengaluru',
        notes: 'Regular retail account',
        openingBalancePaise: 500000, // ₹5,000.00
      };

      const res = await request(app)
        .post('/api/customers')
        .set('x-dev-user-id', 'test-user-1')
        .send(payload);

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.name, 'Rohan Sharma');
      assert.equal(res.body.data.openingBalancePaise, 500000);
      assert.equal(res.body.data.balancePaise, 500000);
      assert.equal(res.body.data.balanceRupees, 5000);
    });

    it('POST /api/customers rejects invalid inputs with validation error', async () => {
      // Empty name
      const res = await request(app)
        .post('/api/customers')
        .set('x-dev-user-id', 'test-user-1')
        .send({
          name: '',
          openingBalancePaise: 100,
        });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'VALIDATION_ERROR');

      // Negative balance
      const res2 = await request(app)
        .post('/api/customers')
        .set('x-dev-user-id', 'test-user-1')
        .send({
          name: 'Invalid Balance User',
          openingBalancePaise: -500,
        });

      assert.equal(res2.status, 400);
      assert.equal(res2.body.error, 'VALIDATION_ERROR');

      // Float instead of integer
      const res3 = await request(app)
        .post('/api/customers')
        .set('x-dev-user-id', 'test-user-1')
        .send({
          name: 'Floating User',
          openingBalancePaise: 12.5,
        });

      assert.equal(res3.status, 400);
      assert.equal(res3.body.error, 'VALIDATION_ERROR');
    });

    it('PATCH /api/customers/:id updates customer notes and phone', async () => {
      const createRes = await request(app)
        .post('/api/customers')
        .set('x-dev-user-id', 'test-user-1')
        .send({
          name: 'Vijay Kumar',
          phone: '9000000000',
          openingBalancePaise: 0,
        });

      const customerId = createRes.body.data._id;

      const patchRes = await request(app)
        .patch(`/api/customers/${customerId}`)
        .set('x-dev-user-id', 'test-user-1')
        .send({
          phone: '9111111111',
          notes: 'Updated contact details',
        });

      assert.equal(patchRes.status, 200);
      assert.equal(patchRes.body.data.phone, '9111111111');
      assert.equal(patchRes.body.data.notes, 'Updated contact details');
    });
  });

  describe('Dues, Payments, Balances, and Duplicate Prevention', () => {
    let customerId;

    before(async () => {
      // Create customer with ₹1,000 opening balance (100000 paise)
      const res = await request(app)
        .post('/api/customers')
        .set('x-dev-user-id', 'test-user-1')
        .send({
          name: 'Kavita Singh',
          phone: '9888877777',
          openingBalancePaise: 100000,
        });
      customerId = res.body.data._id;
    });

    it('POST /api/customers/:id/dues adds new due and updates total dues', async () => {
      // Add due of ₹500 (50000 paise)
      const res = await request(app)
        .post(`/api/customers/${customerId}/dues`)
        .set('x-dev-user-id', 'test-user-1')
        .send({
          clientTransactionId: 'due-tx-101',
          amountPaise: 50000,
          reason: 'Groceries borrow',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.amountPaise, 50000);
      assert.equal(res.body.data.reason, 'Groceries borrow');
    });

    it('POST /api/customers/:id/dues prevents duplicate submission with same clientTransactionId', async () => {
      const res = await request(app)
        .post(`/api/customers/${customerId}/dues`)
        .set('x-dev-user-id', 'test-user-1')
        .send({
          clientTransactionId: 'due-tx-101', // Identical ID
          amountPaise: 50000,
          reason: 'Groceries borrow',
        });

      // Should return 200 with idempotent message and existing record, not create duplicate
      assert.equal(res.status, 200);
      assert.ok(res.body.message.includes('idempotent duplicate'));
    });

    it('POST /api/customers/:id/payments records payment and prevents duplicate clientTransactionId', async () => {
      // Record payment of ₹800 (80000 paise)
      const res = await request(app)
        .post(`/api/customers/${customerId}/payments`)
        .set('x-dev-user-id', 'test-user-1')
        .send({
          clientTransactionId: 'pay-tx-201',
          amountPaise: 80000,
          paymentMethod: 'upi',
          notes: 'Google Pay transfer',
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.data.amountPaise, 80000);
      assert.equal(res.body.data.paymentMethod, 'upi');

      // Duplicate payment attempt
      const dupRes = await request(app)
        .post(`/api/customers/${customerId}/payments`)
        .set('x-dev-user-id', 'test-user-1')
        .send({
          clientTransactionId: 'pay-tx-201',
          amountPaise: 80000,
          paymentMethod: 'upi',
        });

      assert.equal(dupRes.status, 200);
      assert.ok(dupRes.body.message.includes('idempotent duplicate'));
    });

    it('GET /api/customers/:id calculates outstanding balance accurately', async () => {
      // Opening: 100,000 paise (₹1,000)
      // Dues: 50,000 paise (₹500) -> Total Credit = 150,000 paise (₹1,500)
      // Payments: 80,000 paise (₹800)
      // Balance = 150,000 - 80,000 = 70,000 paise (₹700)
      const res = await request(app)
        .get(`/api/customers/${customerId}`)
        .set('x-dev-user-id', 'test-user-1');

      assert.equal(res.status, 200);
      assert.equal(res.body.data.openingBalancePaise, 100000);
      assert.equal(res.body.data.totalNewDuesPaise, 50000);
      assert.equal(res.body.data.totalCreditPaise, 150000);
      assert.equal(res.body.data.totalPaidPaise, 80000);
      assert.equal(res.body.data.balancePaise, 70000);
      assert.equal(res.body.data.balanceRupees, 700);
    });

    it('GET /api/customers/:id/transactions returns full chronological ledger', async () => {
      const res = await request(app)
        .get(`/api/customers/${customerId}/transactions`)
        .set('x-dev-user-id', 'test-user-1');

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      // Contains opening balance (1), new due (1), payment (1) = 3 total
      assert.equal(res.body.data.length, 3);
    });
  });

  describe('Multi-Tenant Data Isolation', () => {
    it('Different test users cannot view or mutate each other records', async () => {
      // User A creates customer
      const resA = await request(app)
        .post('/api/customers')
        .set('x-dev-user-id', 'user-tenant-a')
        .send({
          name: 'Tenant A Secret Customer',
          openingBalancePaise: 250000,
        });

      assert.equal(resA.status, 201);
      const custAId = resA.body.data._id;

      // User B tries to read User A's customer
      const resB = await request(app)
        .get(`/api/customers/${custAId}`)
        .set('x-dev-user-id', 'user-tenant-b');

      assert.equal(resB.status, 404);

      // User B list customers does not contain User A's customer
      const listB = await request(app)
        .get('/api/customers')
        .set('x-dev-user-id', 'user-tenant-b');

      const found = listB.body.data.some((c) => c._id === custAId);
      assert.equal(found, false);
    });
  });

  describe('Dashboard Summary & Sync Status', () => {
    it('GET /api/dashboard/summary calculates totals across all customers', async () => {
      const res = await request(app)
        .get('/api/dashboard/summary')
        .set('x-dev-user-id', 'test-user-1');

      assert.equal(res.status, 200);
      assert.ok(res.body.data.totalCustomers >= 1);
      assert.ok(res.body.data.totalOutstandingPaise >= 0);
    });

    it('GET /api/sync/status returns server metadata and record counts', async () => {
      const res = await request(app)
        .get('/api/sync/status')
        .set('x-dev-user-id', 'test-user-1');

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.records.customers >= 1);
      assert.equal(res.body.data.syncProtocolVersion, '1.0.0');
    });

    it('POST /api/sync/batch processes queued records and returns status', async () => {
      const res = await request(app)
        .post('/api/sync/batch')
        .set('x-dev-user-id', 'test-user-1')
        .send({
          items: [
            {
              localId: 'local-sync-cust-1',
              entityType: 'customer',
              operation: 'CREATE',
              payload: {
                name: 'Batch Synced Customer',
                phone: '9999911111',
                openingBalancePaise: 40000,
              },
            },
          ],
        });

      assert.equal(res.status, 200);
      assert.equal(res.body.processed, 1);
      assert.equal(res.body.data[0].status, 'SUCCESS');
      assert.ok(res.body.data[0].backendId);
    });
  });
});

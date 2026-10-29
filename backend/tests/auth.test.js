import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app.js';
import { Customer, DueTransaction, Payment, User } from '../src/models/index.js';
import { TokenService } from '../src/services/tokenService.js';
import jwt from 'jsonwebtoken';

let mongod;
let app;

describe('Phase 4: Google Auth & Authorization Tests', () => {
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

  describe('1. Google Token Verification Rejection', () => {
    it('POST /api/auth/google rejects invalid / garbage Google ID token', async () => {
      const res = await request(app)
        .post('/api/auth/google')
        .send({ idToken: 'invalid.garbage.token' });

      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'GOOGLE_AUTH_FAILED');
    });

    it('POST /api/auth/google rejects missing idToken', async () => {
      const res = await request(app)
        .post('/api/auth/google')
        .send({});

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'VALIDATION_ERROR');
    });
  });

  describe('2. JWT Generation, Validation, and Expiration', () => {
    it('generates valid JWT with user claims', () => {
      const token = TokenService.generateToken({
        id: 'user_123',
        email: 'merchant@example.com',
        googleSub: 'sub_99999',
      });
      assert.ok(typeof token === 'string' && token.length > 20);

      const payload = TokenService.verifyToken(token);
      assert.equal(payload.userId, 'user_123');
      assert.equal(payload.email, 'merchant@example.com');
      assert.equal(payload.googleSub, 'sub_99999');
    });

    it('rejects tampered or invalid JWT signature', () => {
      const validToken = TokenService.generateToken({ id: 'user_123' });
      const tampered = validToken.slice(0, -5) + 'abcde';
      assert.throws(() => {
        TokenService.verifyToken(tampered);
      });
    });

    it('rejects expired JWT token', () => {
      const secret = process.env.JWT_SECRET || 'dev_insecure_fallback_secret_key_2026';
      const expiredToken = jwt.sign(
        { userId: 'expired_user', email: 'expired@test.com' },
        secret,
        { expiresIn: '-1s' }
      );

      assert.throws(
        () => {
          TokenService.verifyToken(expiredToken);
        },
        (err) => err.name === 'TokenExpiredError'
      );
    });
  });

  describe('3. Protected Endpoints Reject Unauthenticated Requests in Production Mode', () => {
    const originalEnv = process.env.NODE_ENV;

    before(() => {
      process.env.NODE_ENV = 'production';
    });

    after(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('GET /api/customers returns 401 when missing token in production', async () => {
      const res = await request(app).get('/api/customers');
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'UNAUTHORIZED');
    });

    it('GET /api/customers rejects mock headers in production', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('x-dev-user-id', 'hacker-attempt');
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'UNAUTHORIZED');
    });

    it('GET /api/dashboard/summary returns 401 when token is missing in production', async () => {
      const res = await request(app).get('/api/dashboard/summary');
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'UNAUTHORIZED');
    });

    it('POST /api/sync/batch returns 401 when unauthenticated in production', async () => {
      const res = await request(app)
        .post('/api/sync/batch')
        .send({ items: [] });
      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'UNAUTHORIZED');
    });

    it('GET /api/customers returns 401 for expired token', async () => {
      const secret = process.env.JWT_SECRET || 'dev_insecure_fallback_secret_key_2026';
      const expiredToken = jwt.sign(
        { userId: 'user_expired' },
        secret,
        { expiresIn: '-5s' }
      );

      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${expiredToken}`);

      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'TOKEN_EXPIRED');
    });

    it('GET /api/customers returns 401 for invalid bearer token', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', 'Bearer gibberish_token_string');

      assert.equal(res.status, 401);
      assert.equal(res.body.error, 'INVALID_TOKEN');
    });
  });

  describe('4. Multi-Tenant User Isolation & Authorization', () => {
    let tokenUserA;
    let tokenUserB;
    let customerAId;

    before(async () => {
      // Create User A in DB
      const userA = await User.create({
        googleSub: 'google_sub_user_a',
        email: 'usera@example.com',
        name: 'Merchant Alice',
      });
      tokenUserA = TokenService.generateToken({
        id: userA._id.toString(),
        email: userA.email,
        googleSub: userA.googleSub,
      });

      // Create User B in DB
      const userB = await User.create({
        googleSub: 'google_sub_user_b',
        email: 'userb@example.com',
        name: 'Merchant Bob',
      });
      tokenUserB = TokenService.generateToken({
        id: userB._id.toString(),
        email: userB.email,
        googleSub: userB.googleSub,
      });
    });

    it('User A creates a customer', async () => {
      const res = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${tokenUserA}`)
        .send({
          name: 'Alice Customer 1',
          phone: '9811111111',
          openingBalancePaise: 100000,
        });

      assert.equal(res.status, 201);
      assert.equal(res.body.success, true);
      customerAId = res.body.data._id || res.body.data.id;
      assert.ok(customerAId, 'Customer ID should exist');
    });

    it('User B cannot see User A customer in GET /api/customers list', async () => {
      const res = await request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${tokenUserB}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      const found = res.body.data.find((c) => (c._id || c.id) === customerAId);
      assert.equal(found, undefined, 'User B must not see User A customer');
    });

    it('User B cannot access User A customer details (GET /api/customers/:id returns 404)', async () => {
      const res = await request(app)
        .get(`/api/customers/${customerAId}`)
        .set('Authorization', `Bearer ${tokenUserB}`);

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error, 'CUSTOMER_NOT_FOUND');
    });

    it('User B cannot create a due transaction for User A customer', async () => {
      const res = await request(app)
        .post(`/api/customers/${customerAId}/dues`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({
          amountPaise: 25000,
          reason: 'Unauthorized Due Entry',
        });

      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'CUSTOMER_NOT_FOUND');
    });

    it('User B cannot create a payment for User A customer', async () => {
      const res = await request(app)
        .post(`/api/customers/${customerAId}/payments`)
        .set('Authorization', `Bearer ${tokenUserB}`)
        .send({
          amountPaise: 10000,
          paymentMethod: 'cash',
        });

      assert.equal(res.status, 404);
      assert.equal(res.body.error, 'CUSTOMER_NOT_FOUND');
    });

    it('User B dashboard summary is isolated and does not include User A totals', async () => {
      const resB = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${tokenUserB}`);

      assert.equal(resB.status, 200);
      assert.equal(resB.body.data.totalCustomers, 0);
      assert.equal(resB.body.data.totalOutstandingPaise, 0);

      const resA = await request(app)
        .get('/api/dashboard/summary')
        .set('Authorization', `Bearer ${tokenUserA}`);

      assert.equal(resA.status, 200);
      assert.equal(resA.body.data.totalCustomers, 1);
      assert.equal(resA.body.data.totalOutstandingPaise, 100000);
    });

    it('GET /api/auth/me returns the authenticated user profile', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${tokenUserA}`);

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.email, 'usera@example.com');
      assert.equal(res.body.data.name, 'Merchant Alice');
    });
  });

  describe('5. Duplicate Prevention Under Authenticated Context', () => {
    let tokenUser;
    let customerId;

    before(async () => {
      const user = await User.create({
        googleSub: 'google_sub_idempotent',
        email: 'idempotent@example.com',
        name: 'Idempotent Merchant',
      });
      tokenUser = TokenService.generateToken({
        id: user._id.toString(),
        email: user.email,
        googleSub: user.googleSub,
      });

      const custRes = await request(app)
        .post('/api/customers')
        .set('Authorization', `Bearer ${tokenUser}`)
        .send({ name: 'Testing Idempotency' });
      customerId = custRes.body.data._id || custRes.body.data.id;
    });

    it('re-submitting identical clientTransactionId returns existing due without duplicating balance', async () => {
      const clientTxId = 'due-retry-12345';
      const payload = {
        clientTransactionId: clientTxId,
        amountPaise: 30000,
        reason: 'Goods on credit',
      };

      const res1 = await request(app)
        .post(`/api/customers/${customerId}/dues`)
        .set('Authorization', `Bearer ${tokenUser}`)
        .send(payload);

      assert.equal(res1.status, 201);
      const firstDueId = res1.body.data._id || res1.body.data.id;

      // Retry with same clientTransactionId
      const res2 = await request(app)
        .post(`/api/customers/${customerId}/dues`)
        .set('Authorization', `Bearer ${tokenUser}`)
        .send(payload);

      assert.equal(res2.status, 200);
      assert.equal(res2.body.data._id || res2.body.data.id, firstDueId);

      // Verify balance was only added once (30000 paise)
      const custRes = await request(app)
        .get(`/api/customers/${customerId}`)
        .set('Authorization', `Bearer ${tokenUser}`);
      assert.equal(custRes.body.data.balancePaise, 30000);
    });
  });
});

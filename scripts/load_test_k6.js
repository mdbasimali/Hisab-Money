import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Custom Metrics for Production Readiness Assessment
const errors5xx = new Counter('http_errors_5xx');
const failureRate = new Rate('request_failure_rate');
const customerLatency = new Trend('customer_flow_latency');
const syncLatency = new Trend('sync_flow_latency');

// Target Configuration
const BASE_URL = __ENV.TARGET_URL || 'http://localhost:5000';
const AUTH_TOKEN = __ENV.AUTH_TOKEN || ''; // Pre-generated staging JWT (optional)
const DEV_USER_ID = __ENV.DEV_USER_ID || 'staging-loadtest-runner';

// Staged Ramp-up Configuration: 10 -> 25 -> 50 -> 100 Virtual Users
export const options = {
  stages: [
    { duration: '30s', target: 10 },  // Level 1: Warmup & baseline (10 VUs)
    { duration: '1m',  target: 10 },  // Steady state at 10 VUs
    { duration: '30s', target: 25 },  // Level 2: Ramp to 25 VUs
    { duration: '1m',  target: 25 },  // Steady state at 25 VUs
    { duration: '30s', target: 50 },  // Level 3: Ramp to 50 VUs (moderate load)
    { duration: '1m',  target: 50 },  // Steady state at 50 VUs
    { duration: '30s', target: 100 }, // Level 4: Ramp to 100 VUs (peak load)
    { duration: '1m',  target: 100 }, // Steady state at 100 VUs
    { duration: '30s', target: 0 },   // Graceful cooldown
  ],
  thresholds: {
    // SLO Response Time Targets
    http_req_duration: [
      'p(50) < 200',  // Median response time under 200ms
      'p(95) < 600',  // 95th percentile under 600ms
      'p(99) < 1500', // 99th percentile under 1.5s
    ],
    // Request error rate must stay below 1%
    request_failure_rate: ['rate < 0.01'],
    // Zero 5xx server errors permitted during normal operating levels
    http_errors_5xx: ['count == 0'],
  },
};

/**
 * Standard request headers builder
 * Uses Bearer JWT if provided, or staging dev identifier when running against local/staging test DB
 */
function getHeaders() {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (AUTH_TOKEN) {
    headers['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  } else {
    headers['x-dev-user-id'] = `${DEV_USER_ID}-${__VU}`;
  }
  return headers;
}

/**
 * Helper to record checks and metrics
 */
function evaluateResponse(res, checkName) {
  const isOk = res.status >= 200 && res.status < 300;
  failureRate.add(!isOk);

  if (res.status >= 500) {
    errors5xx.add(1);
    console.error(`[5xx Error] ${checkName} returned ${res.status}: ${res.body}`);
  }

  return check(res, {
    [`${checkName} status 2xx`]: () => isOk,
  });
}

export default function () {
  const headers = getHeaders();
  const vuPrefix = `vu${__VU}_iter${__ITER}_${Date.now()}`;

  // ─── 1. Health & Liveness Check ───────────────────────────────────────────
  group('01_Health_Check', () => {
    const res = http.get(`${BASE_URL}/api/health`);
    evaluateResponse(res, 'Health Check');
    check(res, {
      'database is connected': (r) => {
        try {
          return JSON.parse(r.body).database === 'connected';
        } catch {
          return false;
        }
      },
    });
  });

  sleep(0.5);

  // ─── 2. Dashboard Summary Flow ────────────────────────────────────────────
  group('02_Dashboard_Summary', () => {
    const res = http.get(`${BASE_URL}/api/dashboard/summary`, { headers });
    evaluateResponse(res, 'Dashboard Summary');
  });

  sleep(0.5);

  // ─── 3. Customer Operations (Read & Write) ─────────────────────────────────
  let createdCustomerId = null;
  group('03_Customer_Lifecycle', () => {
    const start = Date.now();

    // 3a. Create a disposable staging customer
    const createPayload = JSON.stringify({
      name: `Test Staging Customer ${vuPrefix}`,
      phone: '9800000000',
      address: 'Disposable Staging Area',
      notes: 'Automated k6 load test record',
      openingBalancePaise: 50000, // ₹500
    });

    const createRes = http.post(`${BASE_URL}/api/customers`, createPayload, { headers });
    const createOk = evaluateResponse(createRes, 'Customer Creation');

    if (createOk) {
      try {
        const body = JSON.parse(createRes.body);
        createdCustomerId = body.data?._id;
      } catch (e) {}
    }

    // 3b. Read customer list with calculated balances
    const listRes = http.get(`${BASE_URL}/api/customers`, { headers });
    evaluateResponse(listRes, 'Customer List');

    customerLatency.add(Date.now() - start);
  });

  sleep(0.5);

  // ─── 4. Dues & Payments Ledger Flow ────────────────────────────────────────
  if (createdCustomerId) {
    group('04_Ledger_Transactions', () => {
      // 4a. Add a due transaction with idempotent clientTransactionId
      const duePayload = JSON.stringify({
        clientTransactionId: `due_tx_${vuPrefix}`,
        amountPaise: 25000, // ₹250
        reason: 'Load test goods purchase',
        transactionDate: new Date().toISOString(),
      });

      const dueRes = http.post(
        `${BASE_URL}/api/customers/${createdCustomerId}/dues`,
        duePayload,
        { headers }
      );
      evaluateResponse(dueRes, 'Record Due');

      // 4b. Record a payment
      const paymentPayload = JSON.stringify({
        clientTransactionId: `pay_tx_${vuPrefix}`,
        amountPaise: 20000, // ₹200
        paymentMethod: 'cash',
        paymentDate: new Date().toISOString(),
      });

      const payRes = http.post(
        `${BASE_URL}/api/customers/${createdCustomerId}/payments`,
        paymentPayload,
        { headers }
      );
      evaluateResponse(payRes, 'Record Payment');

      // 4c. Verify customer ledger recalculation
      const custRes = http.get(
        `${BASE_URL}/api/customers/${createdCustomerId}`,
        { headers }
      );
      evaluateResponse(custRes, 'Get Customer Balance');
    });
  }

  sleep(0.5);

  // ─── 5. Offline Sync Batch Endpoint ───────────────────────────────────────
  group('05_Offline_Sync_Batch', () => {
    const start = Date.now();
    const batchPayload = JSON.stringify({
      items: [
        {
          localId: `local_cust_${vuPrefix}`,
          entityType: 'customer',
          operation: 'CREATE',
          payload: {
            name: `Sync Cust ${vuPrefix}`,
            openingBalancePaise: 10000,
          },
        },
      ],
    });

    const syncRes = http.post(`${BASE_URL}/api/sync/batch`, batchPayload, { headers });
    evaluateResponse(syncRes, 'Sync Batch');
    syncLatency.add(Date.now() - start);
  });

  // Pacing jitter between 1s and 2s to simulate human mobile usage
  sleep(1 + Math.random());
}

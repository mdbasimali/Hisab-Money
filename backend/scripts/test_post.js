import http from 'http';

const data = JSON.stringify({
  localId: 'cust-node-test-1',
  name: 'Test Customer Node',
  phone: '9876543210',
  openingBalancePaise: 250000,
});

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: 5000,
    path: '/api/customers',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
      'x-dev-user-id': 'dev-user-1',
    },
  },
  (res) => {
    let body = '';
    res.on('data', (chunk) => (body += chunk));
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Response:', body);
    });
  }
);

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.write(data);
req.end();

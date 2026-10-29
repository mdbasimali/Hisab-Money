import dotenv from 'dotenv';
dotenv.config();

import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    // Attempt MongoDB connection
    try {
      await connectDB();
    } catch (dbErr) {
      console.warn(`[Server] Warning: MongoDB connection failed (${dbErr.message}).`);
      console.warn('[Server] Running server in offline-ready state. Check MONGODB_URI in .env');
    }

    const app = createApp();

    const nets = (await import('os')).networkInterfaces();
    let lanIp = 'localhost';
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          lanIp = net.address;
          break;
        }
      }
    }

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(` Hisab Money Backend API`);
      console.log(` Mode:        ${process.env.NODE_ENV || 'development'}`);
      console.log(` Listening:   http://0.0.0.0:${PORT} (LAN: http://${lanIp}:${PORT})`);
      console.log(` Health:      http://localhost:${PORT}/api/health`);
      console.log(` Docs/Routes: /api/customers, /api/dashboard/summary`);
      console.log(`====================================================`);
    });

    // Configure reverse proxy resilient timeouts for Render / Cloudflare
    // keepAliveTimeout must exceed upstream reverse proxy idle timeout (Render is 60s)
    server.keepAliveTimeout = 65000;
    server.headersTimeout = 66000;
    server.requestTimeout = 30000; // 30s max connection processing time

    const shutdown = async (signal) => {
      console.log(`\nReceived ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDB();
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Fatal bootstrap error:', err);
    process.exit(1);
  }
}

bootstrap();

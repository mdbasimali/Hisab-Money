import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import customerRoutes from './routes/customerRoutes.js';
import authRoutes from './routes/authRoutes.js';
import { getDashboardSummary } from './controllers/dashboardController.js';
import { getSyncStatus, syncBatch } from './controllers/syncController.js';
import { authenticate } from './middleware/auth.js';
import mongoose from 'mongoose';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();

  // Enable trust proxy for reverse proxies (Render / Cloudflare) to ensure accurate rate-limiting by client IP
  app.set('trust proxy', 1);

  // 1. Security Headers via Helmet
  app.use(helmet());

  // 2. CORS with Explicit Allowed Origins
  const rawOrigins = process.env.ALLOWED_ORIGINS || '';
  const allowedOrigins = rawOrigins
    ? rawOrigins.split(',').map((o) => o.trim()).filter(Boolean)
    : ['http://localhost:8081', 'http://localhost:8082'];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow mobile app requests (often no origin header) or matching origins
        if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
          return callback(null, true);
        }
        return callback(new Error(`Origin ${origin} is not allowed by CORS`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-dev-user-id'],
    })
  );

  // 3. Body Parsing
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  // 4. Rate Limiting
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 mins default
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000', 10),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: 'TOO_MANY_REQUESTS',
      message: 'Too many requests from this IP, please try again later.',
    },
  });
  app.use('/api', limiter);

  // 5. Health Check Endpoint (Public)
  app.get('/api/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    const isDbConnected = dbState === 1;
    // In production, report degraded / 503 if database disconnected
    const isHealthy = isDbConnected || process.env.NODE_ENV !== 'production';

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'healthy' : 'degraded',
      database: isDbConnected ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      service: 'Hisab Money API',
      version: '1.0.0',
    });
  });

  // OAuth Callback Bridge for mobile browser redirection
  app.get('/api/auth/google/callback', (req, res) => {
    res.send(`
      <!DOCTYPE html>
      <html>
        <head><title>Hisab Money Auth</title></head>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h2>Redirecting to Hisab Money...</h2>
          <script>
            // Read hash fragment containing id_token and redirect to mobile app scheme
            const hash = window.location.hash.substring(1);
            window.location.href = 'hisabkhata://oauth?' + hash;
          </script>
        </body>
      </html>
    `);
  });

  // 6. Public Authentication Routes (Google Sign-In)
  app.use('/api/auth', authRoutes);

  // 7. Protected API Routes (Protected by JWT Authenticate Middleware)
  app.use('/api', authenticate);

  app.use('/api/customers', customerRoutes);
  app.get('/api/dashboard/summary', getDashboardSummary);
  app.get('/api/sync/status', getSyncStatus);
  app.post('/api/sync/batch', syncBatch);

  // 8. 404 Route Handler
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: 'NOT_FOUND',
      message: `Cannot ${req.method} ${req.originalUrl}`,
    });
  });

  // 9. Central Error Handler
  app.use(errorHandler);

  return app;
}

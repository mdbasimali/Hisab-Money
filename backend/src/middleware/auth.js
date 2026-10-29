import { verifyToken } from '../services/tokenService.js';
import { User } from '../models/User.js';

let cachedDevUser = null;

/**
 * Universal Authentication Middleware for Hisab Money Backend.
 *
 * Requirements:
 * 1. Checks Bearer JWT authorization header.
 * 2. In development / test mode ONLY, allows optional mock identity for CLI tests or development emulation.
 * 3. In production, STRICTLY REJECTS mock-user headers or unauthenticated requests.
 */
export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    // 1. Check for standard Bearer JWT
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      try {
        const decoded = verifyToken(token);
        const user = await User.findById(decoded.userId);

        if (!user) {
          return res.status(401).json({
            success: false,
            error: 'USER_NOT_FOUND',
            message: 'Authenticated user account no longer exists',
          });
        }

        req.user = user;
        req.userId = user._id;
        return next();
      } catch (jwtErr) {
        if (jwtErr.name === 'TokenExpiredError') {
          return res.status(401).json({
            success: false,
            error: 'TOKEN_EXPIRED',
            message: 'Session token has expired. Please sign in again.',
          });
        }
        return res.status(401).json({
          success: false,
          error: 'INVALID_TOKEN',
          message: 'Invalid authorization token signature or payload',
        });
      }
    }

    // 2. Development-only Mock Auth fallback
    if (process.env.NODE_ENV === 'production') {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authorization token required. Access denied in production.',
      });
    }

    // Development / Test mode mock identity
    const devUserIdHeader = req.headers['x-dev-user-id'] || process.env.DEV_MOCK_USER_ID || 'dev-user-1';

    if (cachedDevUser && cachedDevUser.devIdentifier === devUserIdHeader) {
      req.user = cachedDevUser;
      req.userId = cachedDevUser._id;
      return next();
    }

    let user = await User.findOne({ devIdentifier: devUserIdHeader });
    if (!user) {
      user = await User.create({
        devIdentifier: devUserIdHeader,
        email: process.env.DEV_MOCK_USER_EMAIL || `${devUserIdHeader}@example.com`,
        name: process.env.DEV_MOCK_USER_NAME || `Test User (${devUserIdHeader})`,
        businessName: process.env.DEV_MOCK_BUSINESS_NAME || 'Sharma General Store',
      });
    }

    if (devUserIdHeader === (process.env.DEV_MOCK_USER_ID || 'dev-user-1')) {
      cachedDevUser = user;
    }

    req.user = user;
    req.userId = user._id;
    next();
  } catch (err) {
    console.error('[AuthMiddleware] Error:', err.message);
    return res.status(500).json({
      success: false,
      error: 'AUTH_ERROR',
      message: 'Failed to process request authentication',
    });
  }
}

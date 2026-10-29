import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { User } from '../models/User.js';

const client = new OAuth2Client();

/**
 * Verifies a Google ID token with Google's official OAuth2Client.
 * Validates token signature, expiration, and audience claims against configured client IDs.
 *
 * @param {string} idToken - The Google ID Token from client
 * @returns {Promise<{ googleSub: string, email: string, name: string, picture: string }>}
 */
export async function verifyGoogleToken(idToken) {
  if (!idToken || typeof idToken !== 'string') {
    throw new Error('Google ID token is required');
  }

  const allowedAudiences = [
    process.env.GOOGLE_CLIENT_ID_WEB,
    process.env.GOOGLE_CLIENT_ID_ANDROID,
  ].filter(Boolean);

  if (allowedAudiences.length === 0 && process.env.NODE_ENV === 'production') {
    throw new Error('Google OAuth client IDs are not configured on server');
  }

  // Verify ID token against Google's public keys
  const ticket = await client.verifyIdToken({
    idToken,
    audience: allowedAudiences.length > 0 ? allowedAudiences : undefined,
  });

  const payload = ticket.getPayload();
  if (!payload || !payload.sub) {
    throw new Error('Invalid Google token payload');
  }

  return {
    googleSub: payload.sub,
    email: payload.email ? payload.email.toLowerCase().trim() : '',
    name: payload.name || '',
    picture: payload.picture || '',
  };
}

/**
 * Generate a signed session JWT for an authenticated user
 *
 * @param {object} user - MongoDB User document
 * @returns {string} - Signed JWT
 */
export function generateToken(user) {
  const secret = process.env.JWT_SECRET || 'dev_insecure_fallback_secret_key_2026';
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  const userId = user._id ? user._id.toString() : (user.id || user.userId);

  return jwt.sign(
    {
      userId,
      email: user.email,
      googleSub: user.googleSub,
    },
    secret,
    {
      expiresIn,
      algorithm: 'HS256',
    }
  );
}

/**
 * Verify and decode an application JWT
 *
 * @param {string} token - Bearer JWT string
 * @returns {object} - Decoded JWT claims
 */
export function verifyToken(token) {
  const secret = process.env.JWT_SECRET || 'dev_insecure_fallback_secret_key_2026';
  return jwt.verify(token, secret, { algorithms: ['HS256'] });
}

export const TokenService = {
  verifyGoogleToken,
  generateToken,
  verifyToken,
};


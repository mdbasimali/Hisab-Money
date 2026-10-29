import { User } from '../models/User.js';
import { verifyGoogleToken, generateToken } from '../services/tokenService.js';

/**
 * Exchange Google ID token for backend session JWT
 * POST /api/auth/google
 */
export async function googleLogin(req, res, next) {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Google idToken is required in request body',
      });
    }

    // Cryptographically verify genuine Google ID token with Google OAuth certs & audience
    const googleProfile = await verifyGoogleToken(idToken);

    // Find or create user via permanent Google Sub ID
    let user = await User.findOne({ googleSub: googleProfile.googleSub });

    if (!user && googleProfile.email) {
      // Check if user already exists by email (link accounts safely)
      user = await User.findOne({ email: googleProfile.email });
      if (user) {
        user.googleSub = googleProfile.googleSub;
        if (!user.name && googleProfile.name) user.name = googleProfile.name;
        if (googleProfile.picture) user.picture = googleProfile.picture;
        await user.save();
      }
    }

    if (!user) {
      // Create new permanent User record
      user = await User.create({
        googleSub: googleProfile.googleSub,
        email: googleProfile.email,
        name: googleProfile.name || 'Google User',
        businessName: googleProfile.name || 'Hisab Money',
        picture: googleProfile.picture || '',
      });
      console.log(`[Auth] Registered user via Google Sign-In: ${user._id}`);
    } else if (googleProfile.picture && user.picture !== googleProfile.picture) {
      user.picture = googleProfile.picture;
      await user.save();
    }

    // Issue backend session JWT
    const token = generateToken(user);

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          businessName: user.businessName,
          phone: user.phone,
          picture: user.picture || googleProfile.picture || '',
          avatarUrl: user.picture || googleProfile.picture || '',
        },
      },
    });
  } catch (err) {
    console.error('[Auth] Google login error:', err.message);
    res.status(401).json({
      success: false,
      error: 'GOOGLE_AUTH_FAILED',
      message: err.message || 'Failed to authenticate Google ID token',
    });
  }
}

/**
 * Get current authenticated user profile
 * GET /api/auth/me
 */
export async function getMe(req, res, next) {
  try {
    const user = req.user;
    res.json({
      success: true,
      data: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        businessName: user.businessName,
        phone: user.phone,
        picture: user.picture || '',
        avatarUrl: user.picture || '',
      },
    });
  } catch (err) {
    next(err);
  }
}

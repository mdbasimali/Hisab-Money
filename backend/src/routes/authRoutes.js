import { Router } from 'express';
import { googleLogin, getMe } from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

// Public auth endpoints
router.post('/google', googleLogin);

// Protected auth endpoints
router.get('/me', authenticate, getMe);

export default router;

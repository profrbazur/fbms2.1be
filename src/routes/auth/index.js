import { Router } from 'express';
import { login, me, logout } from '../../controllers/authController.js';
import { validateLogin } from '../../middleware/validateLogin.js';
import { authenticate } from '../../middleware/authenticate.js';
import { loginRateLimiter } from '../../middleware/rateLimiter.js';

const router = Router();

router.post('/login', loginRateLimiter, validateLogin, login);
router.get('/me', authenticate, me);
router.post('/logout', logout);

export default router;

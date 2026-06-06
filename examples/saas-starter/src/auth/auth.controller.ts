import { Router, Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginSchema, RegisterSchema } from './dto/login.dto';
import { rateLimiter } from '../shared/middleware/rate-limiter';
import { authenticate } from '../shared/middleware/authenticate';

const router = Router();
const authService = new AuthService();

router.post('/login', rateLimiter({ max: 5, windowMs: 60000 }), async (req: Request, res: Response) => {
  const dto = LoginSchema.parse(req.body);
  const result = await authService.login(dto.email, dto.password);

  if (result.isErr()) {
    return res.status(401).json({ error: result.error.message });
  }

  const { accessToken, refreshToken } = result.value;
  res.cookie('refreshToken', refreshToken, { httpOnly: true, secure: true, sameSite: 'strict' });
  return res.json({ accessToken });
});

router.post('/register', rateLimiter({ max: 3, windowMs: 60000 }), async (req: Request, res: Response) => {
  const dto = RegisterSchema.parse(req.body);
  const result = await authService.register(dto);

  if (result.isErr()) {
    return res.status(400).json({ error: result.error.message });
  }

  return res.status(201).json({ userId: result.value.id });
});

router.post('/refresh', async (req: Request, res: Response) => {
  const token = req.cookies.refreshToken;
  if (!token) return res.status(401).json({ error: 'No refresh token' });

  const result = await authService.refresh(token);
  if (result.isErr()) {
    return res.status(401).json({ error: result.error.message });
  }

  const { accessToken, refreshToken: newRefresh } = result.value;
  res.cookie('refreshToken', newRefresh, { httpOnly: true, secure: true, sameSite: 'strict' });
  return res.json({ accessToken });
});

router.post('/logout', authenticate, async (req: Request, res: Response) => {
  const token = req.cookies.refreshToken;
  if (token) await authService.revokeRefreshToken(token);
  res.clearCookie('refreshToken');
  return res.status(204).send();
});

export { router as authRouter };

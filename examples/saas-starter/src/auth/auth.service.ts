import { UserRepository } from '../users/user.repository';
import { TokenService } from './token.service';
import { Result, AppError } from '../shared/result';
import { hashPassword, verifyPassword } from '../shared/crypto';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

interface RegisterDto {
  email: string;
  password: string;
  name: string;
}

export class AuthService {
  private userRepo = new UserRepository();
  private tokenService = new TokenService();

  async login(email: string, password: string): Promise<Result<TokenPair, AppError>> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      return Result.err(new AppError('INVALID_CREDENTIALS', 'Invalid email or password'));
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return Result.err(new AppError('INVALID_CREDENTIALS', 'Invalid email or password'));
    }

    const tokens = await this.tokenService.generatePair(user.id, user.role);
    return Result.ok(tokens);
  }

  async register(dto: RegisterDto): Promise<Result<{ id: string }, AppError>> {
    const existing = await this.userRepo.findByEmail(dto.email);
    if (existing) {
      return Result.err(new AppError('EMAIL_EXISTS', 'Email already registered'));
    }

    const passwordHash = await hashPassword(dto.password);
    const user = await this.userRepo.create({
      email: dto.email,
      name: dto.name,
      passwordHash,
      role: 'member',
    });

    return Result.ok({ id: user.id });
  }

  async refresh(refreshToken: string): Promise<Result<TokenPair, AppError>> {
    const payload = await this.tokenService.validateRefreshToken(refreshToken);
    if (!payload) {
      return Result.err(new AppError('INVALID_TOKEN', 'Refresh token is invalid or expired'));
    }

    await this.tokenService.revokeToken(refreshToken);
    const tokens = await this.tokenService.generatePair(payload.userId, payload.role);
    return Result.ok(tokens);
  }

  async revokeRefreshToken(token: string): Promise<void> {
    await this.tokenService.revokeToken(token);
  }
}

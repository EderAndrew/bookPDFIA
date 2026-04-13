import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthRepository } from '../auth.repository';
import { ProfileRepository } from '../profile.repository';
import { TokenBlacklistService } from '../token-blacklist.service';
import type { AuthenticatedUser } from '../types';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly profileRepository: ProfileRepository,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token não fornecido.');
    }

    if (this.tokenBlacklist.has(token)) {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    const { data, error } = await this.authRepository.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    const profile = await this.profileRepository.findById(data.user.id);

    if (!profile) {
      throw new UnauthorizedException('Perfil de usuário não encontrado.');
    }

    (request as Request & { user: AuthenticatedUser }).user = {
      id: data.user.id,
      email: data.user.email,
      role: profile.role,
      organization_id: profile.organization_id,
      full_name: profile.full_name,
    };

    return true;
  }

  private extractToken(request: Request): string | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }
}

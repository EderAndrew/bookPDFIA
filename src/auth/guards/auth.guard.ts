import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthRepository } from '../auth.repository';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authRepository: AuthRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token não fornecido.');
    }

    const { data, error } = await this.authRepository.getUser(token);

    if (error || !data.user) {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }

    (request as Request & { user: unknown }).user = data.user;
    return true;
  }

  private extractToken(request: Request): string | null {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : null;
  }
}

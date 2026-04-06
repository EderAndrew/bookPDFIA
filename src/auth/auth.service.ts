import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthRepository } from './auth.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  async register(dto: RegisterDto) {
    const { data, error } = await this.authRepository.signUp(
      dto.email,
      dto.password,
      dto.name,
    );

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    return {
      user: data.user,
      session: data.session,
    };
  }

  async login(dto: LoginDto) {
    const { data, error } = await this.authRepository.signIn(
      dto.email,
      dto.password,
    );

    if (error) {
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    return {
      user: data.user,
      session: data.session,
    };
  }

  async logout(userId: string) {
    const { error } = await this.authRepository.signOut(userId);

    if (error) {
      throw new UnauthorizedException(error.message);
    }

    return { message: 'Logout realizado com sucesso.' };
  }
}

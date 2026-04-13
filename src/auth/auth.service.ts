/* eslint-disable prettier/prettier */
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthRepository } from './auth.repository';
import { ProfileRepository } from './profile.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { TokenBlacklistService } from './token-blacklist.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { InviteDto } from './dto/invite.dto';
import type { AuthenticatedUser } from './types';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly profileRepository: ProfileRepository,
    private readonly organizationsRepository: OrganizationsRepository,
    private readonly tokenBlacklist: TokenBlacklistService,
  ) {}

  async register(dto: RegisterDto) {
    const org = await this.organizationsRepository.create(dto.organization_name);

    try {
      const { data, error } = await this.authRepository.signUp(
        dto.email,
        dto.password,
        {
          full_name: dto.full_name,
          organization_id: org.id,
          role: 'admin',
        },
      );

      if (error) {
        this.logger.error(`Erro ao criar usuário: ${error.message}`);
        throw new InternalServerErrorException(
          'Não foi possível criar a conta. Tente novamente mais tarde.',
        );
      }

      return {
        message: 'Conta criada com sucesso.',
        user: {
          id: data.user!.id,
          email: data.user!.email,
        },
        organization: org,
      };
    } catch (error) {
      await this.organizationsRepository.delete(org.id).catch((rollbackErr) => {
        this.logger.error('Falha no rollback da organização', rollbackErr);
      });
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const { data, error } = await this.authRepository.signIn(
      dto.email,
      dto.password,
    );

    if (error) {
      this.logger.warn(`Falha de login para ${dto.email}: ${error.status ?? 'sem código'}`);
      throw new UnauthorizedException('Credenciais inválidas.');
    }

    this.logger.log(`Login bem-sucedido: ${dto.email}`);
    return {
      user: data.user,
      session: data.session,
    };
  }

  async logout(userId: string, token: string) {
    const { error } = await this.authRepository.signOut(userId);

    if (error) {
      this.logger.error(`Erro ao realizar logout: ${error.message}`);
      throw new InternalServerErrorException(
        'Não foi possível realizar o logout. Tente novamente.',
      );
    }

    this.tokenBlacklist.add(token);

    return { message: 'Logout realizado com sucesso.' };
  }

  async invite(dto: InviteDto, admin: AuthenticatedUser) {
    const { data, error } = await this.authRepository.signUp(
      dto.email,
      dto.password,
      {
        full_name: dto.full_name,
        organization_id: admin.organization_id,
        role: 'user',
      },
    );

    if (error) {
      this.logger.error(`Erro ao convidar usuário: ${error.message}`);
      throw new InternalServerErrorException(
        'Não foi possível criar o convite. Tente novamente mais tarde.',
      );
    }

    return {
      message: 'Usuário convidado com sucesso.',
      user: {
        id: data.user!.id,
        email: data.user!.email,
      },
    };
  }

  async getMe(userId: string) {
    const profile = await this.profileRepository.findById(userId);

    if (!profile) {
      throw new UnauthorizedException('Perfil não encontrado.');
    }

    const organization = await this.organizationsRepository.findById(
      profile.organization_id,
    );

    return { profile, organization };
  }
}

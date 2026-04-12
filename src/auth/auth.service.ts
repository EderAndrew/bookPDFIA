import {
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthRepository } from './auth.repository';
import { ProfileRepository } from './profile.repository';
import { OrganizationsRepository } from '../organizations/organizations.repository';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authRepository: AuthRepository,
    private readonly profileRepository: ProfileRepository,
    private readonly organizationsRepository: OrganizationsRepository,
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
      this.logger.error(`Erro ao realizar logout: ${error.message}`);
      throw new InternalServerErrorException(
        'Não foi possível realizar o logout. Tente novamente.',
      );
    }

    return { message: 'Logout realizado com sucesso.' };
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

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface Profile {
  id: string;
  organization_id: string;
  role: 'admin' | 'user';
  full_name: string | null;
  created_at: string;
}

@Injectable()
export class ProfileRepository {
  private readonly logger = new Logger(ProfileRepository.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async findById(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabaseService.client
      .from('profiles')
      .select('id, organization_id, role, full_name, created_at')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      this.logger.error('Erro ao buscar perfil', error.message);
      throw new InternalServerErrorException('Erro ao buscar perfil.');
    }

    return data as Profile;
  }
}

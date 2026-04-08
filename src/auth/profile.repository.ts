import { Injectable, InternalServerErrorException } from '@nestjs/common';
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
  constructor(private readonly supabaseService: SupabaseService) {}

  async findById(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabaseService.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao buscar perfil: ${error.message}`,
      );
    }

    return data as Profile | null;
  }
}

import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface Organization {
  id: string;
  name: string;
  created_at: string;
}

@Injectable()
export class OrganizationsRepository {
  private readonly logger = new Logger(OrganizationsRepository.name);

  constructor(private readonly supabaseService: SupabaseService) {}

  async create(name: string): Promise<Organization> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data, error } = await this.supabaseService.client
      .from('organizations')
      .insert({ name })
      .select()
      .single();

    if (error) {
      this.logger.error('Erro ao criar organização', error.message);
      throw new InternalServerErrorException('Erro ao criar organização.');
    }

    return data as Organization;
  }

  async findById(id: string): Promise<Organization> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { data, error } = await this.supabaseService.client
      .from('organizations')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw new NotFoundException('Organização não encontrada.');
    }

    return data as Organization;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabaseService.client
      .from('organizations')
      .delete()
      .eq('id', id);

    if (error) {
      this.logger.error('Erro ao deletar organização', error.message);
      throw new InternalServerErrorException('Erro ao deletar organização.');
    }
  }

  async findAll(): Promise<Organization[]> {
    const { data, error } = await this.supabaseService.client
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      this.logger.error('Erro ao listar organizações', error.message);
      throw new InternalServerErrorException('Erro ao listar organizações.');
    }

    return (data ?? []) as Organization[];
  }
}

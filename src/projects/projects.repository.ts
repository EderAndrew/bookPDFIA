/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

type DepStatus = 'pending' | 'crawling' | 'indexed' | 'failed';

interface DepInput {
  libName: string;
  version: string;
}

@Injectable()
export class ProjectsRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async create(name: string, userId: string) {
    const { data, error } = await this.supabaseService.client
      .from('projects')
      .insert({ name, user_id: userId })
      .select()
      .single();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao criar projeto: ${error.message}`,
      );
    }

    return data;
  }

  async saveDependencies(projectId: string, deps: DepInput[]) {
    const rows = deps.map((d) => ({
      project_id: projectId,
      lib_name: d.libName,
      version: d.version,
      doc_status: 'pending' as DepStatus,
    }));

    const { data, error } = await this.supabaseService.client
      .from('project_dependencies')
      .insert(rows)
      .select();

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao salvar dependências: ${error.message}`,
      );
    }

    return data;
  }

  async findAllByUser(userId: string) {
    const { data, error } = await this.supabaseService.client
      .from('projects')
      .select('*, project_dependencies(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao listar projetos: ${error.message}`,
      );
    }

    return data;
  }

  async findById(projectId: string, userId: string) {
    const { data, error } = await this.supabaseService.client
      .from('projects')
      .select('*, project_dependencies(*)')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (error) return null;
    return data;
  }

  async updateDependencyStatus(depId: string, status: DepStatus) {
    const { error } = await this.supabaseService.client
      .from('project_dependencies')
      .update({ doc_status: status })
      .eq('id', depId);

    if (error) {
      throw new InternalServerErrorException(
        `Erro ao atualizar status: ${error.message}`,
      );
    }
  }
}

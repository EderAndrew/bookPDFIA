import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BASE_OPTIONS = {
  auth: { autoRefreshToken: false, persistSession: false },
};

@Injectable()
export class SupabaseService {
  /** Cliente singleton para operações de banco (PostgREST). Nunca armazena sessão de usuário. */
  private readonly _client: SupabaseClient;
  private readonly supabaseUrl: string;
  private readonly supabaseKey: string;

  constructor(configService: ConfigService) {
    this.supabaseUrl = configService.getOrThrow<string>('SUPABASE_URL');
    this.supabaseKey = configService.getOrThrow<string>('SUPABASE_SERVICE_KEY');
    this._client = createClient(this.supabaseUrl, this.supabaseKey, BASE_OPTIONS);
  }

  get client(): SupabaseClient {
    return this._client;
  }

  /**
   * Cria um cliente isolado para operações de autenticação (signIn, signUp).
   * Cada chamada retorna uma nova instância para evitar que sessões de usuário
   * contaminem o cliente singleton usado pelo PostgREST.
   */
  createAuthClient() {
    return createClient(this.supabaseUrl, this.supabaseKey, BASE_OPTIONS);
  }
}

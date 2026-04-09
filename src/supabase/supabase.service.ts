import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const BASE_OPTIONS = {
  auth: { autoRefreshToken: false, persistSession: false },
};

@Injectable()
export class SupabaseService {
  /** Cliente singleton para operações de banco (PostgREST). Nunca armazena sessão de usuário. */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  private readonly _client: SupabaseClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!,
    BASE_OPTIONS,
  );

  get client(): SupabaseClient {
    return this._client;
  }

  /**
   * Cria um cliente isolado para operações de autenticação (signIn, signUp).
   * Cada chamada retorna uma nova instância para evitar que sessões de usuário
   * contaminem o cliente singleton usado pelo PostgREST.
   */

  createAuthClient() {
    return createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!,
      BASE_OPTIONS,
    );
  }
}

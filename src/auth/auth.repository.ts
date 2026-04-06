import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class AuthRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async signUp(email: string, password: string, name: string) {
    return this.supabaseService.client.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
  }

  async signIn(email: string, password: string) {
    return this.supabaseService.client.auth.signInWithPassword({
      email,
      password,
    });
  }

  async signOut(userId: string) {
    return this.supabaseService.client.auth.admin.signOut(userId);
  }

  async getUser(token: string) {
    return this.supabaseService.client.auth.getUser(token);
  }
}

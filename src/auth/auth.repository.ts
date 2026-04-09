import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

export interface SignUpMetadata {
  full_name: string;
  organization_id: string;
  role: 'admin' | 'user';
}

@Injectable()
export class AuthRepository {
  constructor(private readonly supabaseService: SupabaseService) {}

  async createAdminUser(
    email: string,
    password: string,
    metadata: SignUpMetadata,
  ) {
    return this.supabaseService.client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: metadata.full_name,
        organization_id: metadata.organization_id,
        role: metadata.role,
      },
    });
  }

  async signUp(email: string, password: string, metadata: SignUpMetadata) {
    return this.supabaseService.client.auth.signUp({
      email,
      password,
      options: { data: metadata },
    });
  }

  async signIn(email: string, password: string) {
    const result = await this.supabaseService.client.auth.signInWithPassword({
      email,
      password,
    });

    return result;
  }

  async signOut(userId: string) {
    return this.supabaseService.client.auth.admin.signOut(userId);
  }

  async getUser(token: string) {
    return this.supabaseService.client.auth.getUser(token);
  }
}

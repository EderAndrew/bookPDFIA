import { Injectable } from '@nestjs/common';
import { User } from '@supabase/supabase-js';

@Injectable()
export class UsersService {
  getProfile(user: User) {
    return {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name as string | undefined,
      createdAt: user.created_at,
    };
  }
}

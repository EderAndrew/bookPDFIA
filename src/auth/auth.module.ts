import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './guards/auth.guard';
import { AuthRepository } from './auth.repository';
import { ProfileRepository } from './profile.repository';
import { RolesGuard } from './roles.guard';
import { SupabaseModule } from '../supabase/supabase.module';
import { OrganizationsModule } from '../organizations/organizations.module';

@Module({
  imports: [SupabaseModule, OrganizationsModule],
  controllers: [AuthController],
  providers: [AuthService, AuthGuard, AuthRepository, ProfileRepository, RolesGuard],
  exports: [AuthGuard, AuthRepository, ProfileRepository, RolesGuard],
})
export class AuthModule {}

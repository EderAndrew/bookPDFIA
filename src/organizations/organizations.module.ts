import { Module } from '@nestjs/common';
import { SupabaseModule } from '../supabase/supabase.module';
import { OrganizationsRepository } from './organizations.repository';
import { OrganizationsService } from './organizations.service';

@Module({
  imports: [SupabaseModule],
  providers: [OrganizationsRepository, OrganizationsService],
  exports: [OrganizationsRepository, OrganizationsService],
})
export class OrganizationsModule {}

import { Injectable } from '@nestjs/common';
import { Organization, OrganizationsRepository } from './organizations.repository';

@Injectable()
export class OrganizationsService {
  constructor(private readonly organizationsRepository: OrganizationsRepository) {}

  createOrganization(name: string): Promise<Organization> {
    return this.organizationsRepository.create(name);
  }

  findById(id: string): Promise<Organization> {
    return this.organizationsRepository.findById(id);
  }
}

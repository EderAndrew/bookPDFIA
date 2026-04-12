export interface AuthenticatedUser {
  id: string;
  email: string | undefined;
  role: 'admin' | 'user';
  organization_id: string;
  full_name: string | null;
}

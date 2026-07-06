import { useAuth } from '../contexts/AuthContext';

export function useCompanyId(): number {
  const { company } = useAuth();
  if (!company?.id) {
    throw new Error('No company context — user must belong to a company');
  }
  return company.id;
}

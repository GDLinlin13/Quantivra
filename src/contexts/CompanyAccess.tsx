import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from './AuthContext';

/**
 * What the signed-in company user may open, from their roles:
 *  - canViewPay: salaries, payroll, ID / bank numbers, and managing users &
 *    roles (role setting "Can see pay & manage users"; enforced in the
 *    database by migration 020)
 *  - can(module, action): the role's permissions (Roles page), used to decide
 *    which sections and tabs to show.
 *  - canWrite(module) / canRemove(module): add & change (create or edit tick) /
 *    remove (delete or edit tick); buttons follow these, and the database
 *    enforces the same rules (migration 039).
 */
interface CompanyAccess {
  loading: boolean;
  canViewPay: boolean;
  can: (module: string, action?: string) => boolean;
  canAny: (modules: string[], action?: string) => boolean;
  canWrite: (module: string) => boolean;
  canRemove: (module: string) => boolean;
  /** false when the company switched the section off in Settings → Modules */
  isOn: (module: string) => boolean;
  reload: () => void;
}

const Ctx = createContext<CompanyAccess>({
  loading: true, canViewPay: false, can: () => false, canAny: () => false,
  // outside the provider (tests) nothing is hidden; the database still decides
  canWrite: () => true, canRemove: () => true, isOn: () => true, reload: () => {},
});

export function CompanyAccessProvider({ children }: { children: ReactNode }) {
  const { user, companyId } = useAuth();
  const [state, setState] = useState<{ loading: boolean; pay: boolean; perms: Set<string>; off: Set<string> }>({ loading: true, pay: false, perms: new Set(), off: new Set() });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!user?.id || !companyId) return;
    let active = true;
    (async () => {
      const [pay, links, off] = await Promise.all([
        supabase.rpc('app_can_view_pay', { p_company_id: companyId }),
        supabase.from('company_user_roles').select('role_id').eq('user_id', user.id),
        supabase.from('company_settings').select('value').eq('company_id', companyId).eq('category', 'company').eq('key', 'modules_off').maybeSingle(),
      ]);
      const roleIds = (links.data || []).map((l: any) => l.role_id);
      const perms = roleIds.length
        ? (await supabase.from('company_permissions').select('module, action').in('role_id', roleIds)).data || []
        : [];
      if (active) setState({
        loading: false,
        pay: pay.data === true,
        perms: new Set(perms.map((p: any) => `${p.module}:${p.action}`)),
        off: new Set<string>(Array.isArray(off.data?.value?.modules) ? off.data.value.modules : []),
      });
    })().catch(() => { if (active) setState({ loading: false, pay: false, perms: new Set(), off: new Set() }); });
    return () => { active = false; };
  }, [user?.id, companyId, tick]);

  // People with pay access manage the company, so they can open everything.
  // ...except sections the company switched off (Settings → Modules), which are hidden for everyone.
  const isOn = (module: string) => !state.off.has(module);
  const can = (module: string, action = 'view') => isOn(module) && (state.pay || state.perms.has(`${module}:${action}`));
  const value: CompanyAccess = {
    loading: state.loading, canViewPay: state.pay, can,
    canAny: (modules, action = 'view') => modules.some(m => can(m, action)),
    canWrite: m => can(m, 'create') || can(m, 'edit'),
    canRemove: m => can(m, 'delete') || can(m, 'edit'),
    isOn,
    reload: () => setTick(t => t + 1),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCompanyAccess = () => useContext(Ctx);

/** Sections of the company menu and the permission modules that open them. */
export const HR_MODULES = ['employees', 'leave', 'attendance', 'claims', 'payroll'];

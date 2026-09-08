import { supabase } from '../utils/supabase';
import type { Company, CountryPack } from '../types';

export const companyService = {
  async list(): Promise<Company[]> {
    const { data, error } = await supabase.from('companies').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async get(id: number): Promise<Company | null> {
    const { data, error } = await supabase.from('companies').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },

  async create(company: Partial<Company> & { name: string; country: string }): Promise<Company> {
    const code = company.name.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 20);
    const { data, error } = await supabase.from('companies').insert({
      name: company.name,
      company_code: code,
      country: company.country,
      currency: company.currency || 'SGD',
      financial_year_start: company.financial_year_start || '01-01',
      timezone: company.timezone || 'Asia/Singapore',
      modules: company.modules || [],
    }).select().single();
    if (error) throw error;
    return data;
  },

  async update(id: number, updates: Partial<Company>): Promise<Company> {
    const { data, error } = await supabase.from('companies').update(updates).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async deactivate(id: number): Promise<void> {
    await supabase.from('companies').update({ is_active: false }).eq('id', id);
  },
};

export const countryService = {
  async listPacks(countryCode: string): Promise<CountryPack[]> {
    const { data, error } = await supabase.from('country_pack_versions')
      .select('*')
      .eq('country_code', countryCode)
      .order('effective_from', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async createPack(pack: Partial<CountryPack> & { country_code: string; version: string; config: any }): Promise<CountryPack> {
    const { data, error } = await supabase.from('country_pack_versions').insert(pack).select().single();
    if (error) throw error;
    return data;
  },

};

export const auditService = {
  async log(params: {
    company_id?: number;
    user_id: number;
    action: string;
    entity_type: string;
    entity_id?: string;
    old_value?: any;
    new_value?: any;
  }) {
    const table = params.company_id ? 'audit_log' : 'platform_audit_log';
    await supabase.from(table).insert(params);
  },

  async list(table: 'audit_log' | 'platform_audit_log', companyId?: number, limit = 50): Promise<any[]> {
    let query = supabase.from(table).select('*').order('created_at', { ascending: false }).limit(limit);
    if (companyId) query = query.eq('company_id', companyId);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },
};

export const workflowService = {
  async listTemplates(companyId: number) {
    const { data, error } = await supabase.from('workflow_templates').select('*').eq('company_id', companyId);
    if (error) throw error;
    return data || [];
  },

  async createTemplate(template: any) {
    const { data, error } = await supabase.from('workflow_templates').insert(template).select().single();
    if (error) throw error;
    return data;
  },
};

export const roleService = {
  async list(companyId: number) {
    const { data, error } = await supabase.from('company_roles').select('*').eq('company_id', companyId);
    if (error) throw error;
    return data || [];
  },

  async create(role: any) {
    const { data, error } = await supabase.from('company_roles').insert(role).select().single();
    if (error) throw error;
    return data;
  },

  async getPermissions(roleId: number) {
    const { data, error } = await supabase.from('company_permissions').select('*').eq('role_id', roleId);
    if (error) throw error;
    return data || [];
  },

  async setPermissions(roleId: number, permissions: { module: string; feature: string; action: string }[]) {
    await supabase.from('company_permissions').delete().eq('role_id', roleId);
    if (permissions.length > 0) {
      await supabase.from('company_permissions').insert(permissions.map(p => ({ role_id: roleId, ...p })));
    }
  },
};

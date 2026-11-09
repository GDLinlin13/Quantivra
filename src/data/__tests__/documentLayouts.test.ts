import { describe, it, expect, vi } from 'vitest';
vi.mock('../../utils/supabase', () => ({ supabase: {} }));
import { docFields, STARTER_LAYOUTS, LEGACY, sampleData } from '../documentLayouts';
import { ownLayout } from '../../services/branding';

const texts = (t?: { cells: Record<string, { v?: string }> }) => Object.values(t?.cells || {}).map(c => c.v || '').join(' ');

describe('templates belong to each company', () => {
  it('CPF, SDL and self-help group codes only in Singapore', () => {
    expect(docFields('payslip', 'SG').some(f => f.name === 'cpf_employee')).toBe(true);
    const ae = docFields('payslip', 'AE');
    expect(ae.some(f => /cpf|sdl|shg/.test(f.name))).toBe(false);
    expect(ae.find(f => f.name === 'company_reg_no')?.label).toBe('Trade Licence No.');
    expect(sampleData('payslip', { country: 'AE', currency: 'AED' }, null).fields.cpf_employee).toBeUndefined();
  });

  it('custom starts as a copy of the pre-built design, with this company\'s choices', () => {
    const branding = { registration_no: '123', address: 'Dubai', templates: { payslip: { showLogo: true, showDesignation: false, showNationalId: true } } };
    const t = texts(STARTER_LAYOUTS.payslip('AE', branding));
    expect(t).toMatch(/PAYSLIP/);
    expect(t).toMatch(/Trade Licence No\. \{\{company_reg_no\}\}/);
    expect(t).toMatch(/Emirates ID/);
    expect(t).not.toMatch(/Designation|cpf|UEN|EMPLOYEE PAYSLIP|NETT SALARY/);
    expect(texts(STARTER_LAYOUTS.invoice('AE', null))).toMatch(/Our TRN \{\{company_gst_no\}\}/);
  });

  it('the older starter left untouched counts as not designed yet; own designs stay', () => {
    const old = { ...LEGACY.payslip(true, 'UEN'), enabled: false };
    expect(ownLayout('payslip', JSON.parse(JSON.stringify(old)), 'SG')).toBeUndefined();
    expect(ownLayout('payslip', { ...old, enabled: true }, 'AE')).toBeUndefined();
    expect(texts(ownLayout('payslip', { ...old, enabled: true }, 'SG'))).toMatch(/cpf_employer/);
    const mine = { ...old, enabled: true, cells: { ...old.cells, '0:4': { v: 'My own header' } } };
    expect(texts(ownLayout('payslip', mine, 'AE'))).toMatch(/My own header/);
    expect(ownLayout('payslip', null, 'AE')).toBeUndefined();
  });
});

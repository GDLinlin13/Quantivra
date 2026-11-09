import { describe, it, expect, vi } from 'vitest';
vi.mock('../../utils/supabase', () => ({ supabase: {} }));
import { docFields, STARTER_LAYOUTS, sampleData } from '../documentLayouts';
import { ownLayout } from '../../services/branding';

const texts = (t: { cells: Record<string, { v?: string }> }) => Object.values(t.cells).map(c => c.v || '').join(' ');

describe('templates follow the company country', () => {
  it('CPF, SDL and self-help group codes only in Singapore', () => {
    expect(docFields('payslip', 'SG').some(f => f.name === 'cpf_employee')).toBe(true);
    const ae = docFields('payslip', 'AE');
    expect(ae.some(f => /cpf|sdl|shg/.test(f.name))).toBe(false);
    expect(ae.find(f => f.name === 'company_reg_no')?.label).toBe('Trade Licence No.');
    expect(sampleData('payslip', { country: 'AE', currency: 'AED' }, null).fields.cpf_employee).toBeUndefined();
  });

  it('starter layouts use the country terms', () => {
    expect(texts(STARTER_LAYOUTS.payslip('SG'))).toMatch(/UEN : .*cpf_employer/);
    const ae = texts(STARTER_LAYOUTS.payslip('AE'));
    expect(ae).not.toMatch(/UEN|cpf/i);
    expect(ae).toMatch(/Trade Licence No\. : .*employer\.name/);
  });

  it('an untouched Singapore starter in another country becomes that country\'s starter; own designs stay', () => {
    const sg = { ...STARTER_LAYOUTS.payslip('SG'), enabled: true };
    const swapped = ownLayout('payslip', JSON.parse(JSON.stringify(sg)), 'AE');
    expect(texts(swapped)).not.toMatch(/cpf/i);
    expect(swapped.enabled).toBe(true);
    const mine = { ...sg, cells: { ...sg.cells, '0:4': { v: 'My own header' } } };
    expect(texts(ownLayout('payslip', mine, 'AE'))).toMatch(/cpf_employer/);
    expect(texts(ownLayout('payslip', sg, 'SG'))).toMatch(/cpf_employer/);
  });
});

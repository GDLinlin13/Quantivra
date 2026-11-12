import { supabase } from '../utils/supabase';
import { normalizeTemplate, type GridTemplate } from '../utils/gridTemplate';
import { isLegacyStarter, type AmountFormat } from '../data/documentLayouts';

export interface PayslipTemplate {
  showLogo: boolean;
  showCompanyBlock: boolean;
  showEmployeeId: boolean;
  showBankAccount: boolean;
  /** Show the full bank account number instead of the masked one. */
  bankAccountFull?: boolean;
  showDesignation?: boolean;
  /** department and date joined under the employee's name (off by default) */
  showDepartment?: boolean;
  showJoinDate?: boolean;
  /** the month and pay date at the top right, the Gross Pay line, the employer's contributions and the amounts the company pays on the employee's behalf (all on by default) */
  showPeriod?: boolean;
  showGrossPay?: boolean;
  showEmployerContributions?: boolean;
  showOnBehalf?: boolean;
  showNationalId?: boolean;
  nationalIdFull?: boolean;
  /** Download file name patterns, e.g. "Payslip - {name} - {month} {year}". */
  fileName?: string;
  combinedFileName?: string;
  amountFormat?: AmountFormat;
  footerNote: string;
  /** Spreadsheet-style layout; used instead of the standard payslip when enabled. */
  layout?: GridTemplate;
}
export interface InvoiceTemplate {
  showLogo: boolean;
  showCompanyBlock: boolean;
  paymentTermsDays: number;
  bankDetails: string;
  /** Payment details as label / value pairs (Account Name, Bank, Account No…). */
  paymentDetails?: { label: string; value: string }[];
  /** Several bank accounts, each a titled list of label / value lines; one is the default. */
  paymentAccounts?: { title: string; lines: { label: string; value: string }[]; isDefault?: boolean }[];
  footerNote: string;
  amountFormat?: AmountFormat;
  /** Download file name pattern, e.g. "{type} {number} - {customer}". */
  fileName?: string;
  layout?: GridTemplate;
}
/** Statement of account. Bank details come from the Invoice Template. */
export interface SoaTemplate {
  showLogo: boolean;
  showCompanyBlock: boolean;
  footerNote: string;
  amountFormat?: AmountFormat;
  /** Download file name pattern, e.g. "Statement - {customer} - {date}". */
  fileName?: string;
  layout?: GridTemplate;
}
export interface DocumentTemplate {
  showLogo: boolean;
  showLetterhead: boolean;
  footerNote: string;
}
export interface Templates {
  payslip: PayslipTemplate;
  invoice: InvoiceTemplate;
  soa: SoaTemplate;
  document: DocumentTemplate;
}

export interface Branding {
  company_id: number;
  logo_data_uri: string | null;
  legal_name: string | null;
  registration_no: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  accent_color: string;
  footer_note: string | null;
  templates: Templates;
}

export const DEFAULT_TEMPLATES: Templates = {
  payslip: { showLogo: true, showCompanyBlock: true, showEmployeeId: true, showBankAccount: false, bankAccountFull: false, showDesignation: true, showNationalId: false, nationalIdFull: false, footerNote: '' },
  invoice: { showLogo: true, showCompanyBlock: true, paymentTermsDays: 30, bankDetails: '', footerNote: '' },
  soa: { showLogo: true, showCompanyBlock: true, footerNote: '' },
  document: { showLogo: true, showLetterhead: true, footerNote: '' },
};

/**
 * The company's own saved layout, or none yet (Custom then starts from a copy of the pre-built design).
 * An untouched copy of the older grid starter counts as none: it was never really this company's design.
 */
export function ownLayout(kind: 'payslip' | 'invoice' | 'soa', saved: any, country?: string | null): GridTemplate | undefined {
  if (!saved) return undefined;
  const t = normalizeTemplate(saved, null as unknown as GridTemplate);
  if (!t) return undefined;
  if (isLegacyStarter(kind, t, country) && (!t.enabled || (country || 'SG').toUpperCase() !== 'SG')) return undefined;
  return t;
}

function withDefaults(row: any, companyId: number, country?: string | null): Branding {
  const t = row?.templates || {};
  return {
    company_id: companyId,
    logo_data_uri: row?.logo_data_uri ?? null,
    legal_name: row?.legal_name ?? null,
    registration_no: row?.registration_no ?? null,
    address: row?.address ?? null,
    phone: row?.phone ?? null,
    email: row?.email ?? null,
    website: row?.website ?? null,
    accent_color: row?.accent_color ?? '#1677ff',
    footer_note: row?.footer_note ?? null,
    templates: {
      payslip: { ...DEFAULT_TEMPLATES.payslip, ...(t.payslip || {}), layout: ownLayout('payslip', t.payslip?.layout, country) },
      invoice: { ...DEFAULT_TEMPLATES.invoice, ...(t.invoice || {}), layout: ownLayout('invoice', t.invoice?.layout, country) },
      soa: { ...DEFAULT_TEMPLATES.soa, ...(t.soa || {}), layout: ownLayout('soa', t.soa?.layout, country) },
      document: { ...DEFAULT_TEMPLATES.document, ...(t.document || {}) },
    },
  };
}

export const brandingService = {
  async get(companyId: number): Promise<Branding> {
    // each company's own templates; one it has not designed yet starts from its own country's layout
    const [{ data }, co] = await Promise.all([
      supabase.from('company_branding').select('*').eq('company_id', companyId).maybeSingle(),
      supabase.from('companies').select('country').eq('id', companyId).maybeSingle(),
    ]);
    return withDefaults(data, companyId, co.data?.country);
  },

  async save(companyId: number, patch: Partial<Omit<Branding, 'company_id'>>): Promise<void> {
    const { error } = await supabase.from('company_branding')
      .upsert({ company_id: companyId, ...patch, updated_at: new Date().toISOString() }, { onConflict: 'company_id' });
    if (error) throw new Error(error.message);
  },
};

/** Downscale + compress an image File to a data URI (<= ~500 KB), for the logo. Big enough to stay sharp when stretched on a document. */
export function fileToLogoDataUri(file: File, maxDim = 1000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, w, h);
        // PNG keeps transparency for logos; fall back to JPEG if huge.
        let uri = canvas.toDataURL('image/png');
        if (uri.length > 700_000) uri = canvas.toDataURL('image/jpeg', 0.85);
        resolve(uri);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

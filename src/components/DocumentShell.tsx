import type { ReactNode } from 'react';
import type { Branding } from '../services/branding';
import { companyRegLabel } from '../data/countries';

/**
 * Branded wrapper for generated documents (payslip, invoice, letter…).
 * Renders on-screen and — because it uses inline styles and a data-URI logo —
 * survives being serialised into a print/PDF window verbatim.
 */
export function DocumentShell({
  branding, companyName, title, meta, showLogo = true, showCompanyBlock = true, footerNote, children, forPrint = false, country,
}: {
  /** the company's country, for what its registration number is called (UEN, Trade Licence No.…) */
  country?: string | null;
  branding: Branding | null;
  companyName: string;
  title: string;
  meta?: ReactNode;
  showLogo?: boolean;
  showCompanyBlock?: boolean;
  footerNote?: string;
  children: ReactNode;
  forPrint?: boolean;
}) {
  const accent = branding?.accent_color || '#1677ff';
  const ink = forPrint ? '#111' : '#f0ede6';
  const sub = forPrint ? '#666' : 'rgba(240,237,230,0.55)';
  const line = forPrint ? '#e2e2e2' : 'rgba(255,255,255,0.1)';
  const legalName = branding?.legal_name || companyName;
  const footer = (footerNote ?? '').trim() || (branding?.footer_note ?? '').trim();

  return (
    <div style={{ color: ink }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, borderBottom: `2px solid ${accent}`, paddingBottom: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {showLogo && branding?.logo_data_uri && (
            <img src={branding.logo_data_uri} alt="" style={{ maxHeight: 56, maxWidth: 160, objectFit: 'contain' }} />
          )}
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{legalName}</div>
            {showCompanyBlock && (
              <div style={{ fontSize: 11, color: sub, lineHeight: 1.5, whiteSpace: 'pre-line' }}>
                {branding?.registration_no ? `${companyRegLabel(country)} ${branding.registration_no}\n` : ''}
                {branding?.address ? `${branding.address}\n` : ''}
                {[branding?.phone, branding?.email, branding?.website].filter(Boolean).join('  ·  ')}
              </div>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: accent }}>{title}</div>
          <div style={{ fontSize: 11, color: sub }}>{meta}</div>
        </div>
      </div>

      {children}

      {footer && (
        <div style={{ marginTop: 16, paddingTop: 8, borderTop: `1px solid ${line}`, fontSize: 10, color: sub, whiteSpace: 'pre-line' }}>
          {footer}
        </div>
      )}
    </div>
  );
}

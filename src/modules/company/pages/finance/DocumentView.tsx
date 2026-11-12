import type { Branding } from '../../../../services/branding';
import { DocumentShell } from '../../../../components/DocumentShell';
import { GridDocument, CellValue } from '../../../../components/GridDocument';
import { companyFields, money as fmtMoney, pickPaymentAccount } from '../../../../data/documentLayouts';
import { docTotals, balanceDue, DOC_LABEL, type FinDocument, type DocLine, type Contact, type ContactPerson, type FinanceSettings } from '../../../../data/finance';
import type { FieldValues, ListValues } from '../../../../utils/gridTemplate';
import type { CatalogItem } from '../../../../data/catalog';
import { taxRegLabel } from '../../../../data/countries';
import { fmtDate } from '../../../../utils/dateFormat';

const qtyText = (n: number) => String(Number(n)).replace(/\.0+$/, '');

/** Fields and lists for the invoice template, from a real document. */
export function documentData(doc: FinDocument, lines: DocLine[], contact: Contact | null, person: ContactPerson | null,
  company: any, branding: Branding | null, settings: FinanceSettings, items: CatalogItem[] = []) {
  const inv = branding?.templates.invoice;
  const cur = doc.currency || company?.currency || 'SGD';
  const M = (n: number) => fmtMoney(n, cur, inv?.amountFormat);
  const t = docTotals(lines, doc.discounts || [], doc.tax_inclusive);
  const bank = pickPaymentAccount(inv, doc.payment_account_index);
  const payRows = (bank?.lines || []).filter(r => (r.value || '').trim());
  const termsDays = doc.due_date ? Math.round((Date.parse(doc.due_date) - Date.parse(doc.issue_date)) / 86400000) : null;
  // Deliver to: what was typed or chosen on the invoice; left blank it is the customer (Bill to)
  const isInvoice = doc.doc_type === 'invoice';
  const hasProducts = isInvoice && lines.some(l => items.find(x => x.id === l.item_id)?.kind === 'product');
  const dName = doc.delivery_name || (isInvoice ? contact?.name || '' : '');
  const dAddr = doc.delivery_address || (isInvoice ? contact?.address || '' : '');
  const fields: FieldValues = {
    ...companyFields(company, branding, inv?.footerNote),
    // {{currency}} is the document's own currency (a USD invoice says USD, not the company's HKD)
    currency: doc.currency || company?.currency || 'SGD',
    document_title: DOC_LABEL[doc.doc_type].toUpperCase(),
    invoice_no: doc.number, invoice_date: fmtDate(doc.issue_date), due_date: fmtDate(doc.due_date),
    payment_terms: termsDays != null ? (termsDays === 0 ? 'Due on receipt' : `${termsDays} days`) : '',
    reference: doc.reference || '', company_gst_no: settings.gstRegistered ? (settings.gstNumber || '') : '',
    customer_name: contact?.name || '', customer_address: contact?.address || '', delivery_name: dName, delivery_address: dAddr,
    deliver_to: (dName || dAddr) && (doc.delivery_address || doc.delivery_name || hasProducts) ? `Deliver to:\n${[dName, dAddr].filter(Boolean).join('\n')}` : '',
    customer_contact: person?.name || '', customer_phone: person?.phone || contact?.phone || '',
    customer_email: person?.email || contact?.email || '', customer_website: contact?.website || '',
    subtotal: M(t.subtotal), total_discount: M(t.discount_total), subtotal_after_discount: M(t.subtotal - t.discount_total),
    tax: M(t.tax_total), total: M(t.total), amount_paid: M(doc.amount_paid || 0), balance_due: M(balanceDue({ total: t.total, amount_paid: doc.amount_paid || 0 })),
    notes: doc.notes || '', terms: doc.terms || settings.invoiceTerms || '',
    bank_details: payRows.length ? payRows.map(r => `${r.label} ${r.value}`).join('\n') : (inv?.bankDetails || ''),
    payment_account: bank?.title || '',
  };
  const lists: ListValues = {
    lines: lines.map((l, i) => ({
      no: String(i + 1), description: l.description, qty: qtyText(l.quantity), unit_price: fmtMoney(l.unit_price, cur, inv?.amountFormat, items.find(x => x.id === l.item_id)?.show_cents === false),
      discount: Number(l.discount_pct) ? `${Number(l.discount_pct)}%` : '', amount: M(t.lines[i]),
    })),
    discounts: (doc.discounts || []).map((d, i) => ({ name: d.kind === 'percent' ? `${d.name || 'Discount'} (${d.value}%)` : (d.name || 'Discount'), amount: M(t.discounts[i]) })).filter((_, i) => t.discounts[i] > 0),
    payment: payRows.map(r => ({ label: r.label, value: r.value })),
  };
  return { fields, lists, totals: t, M, payRows };
}

/** A quotation / invoice / credit note in the company's Invoice Template, ready to print or turn into a PDF. */
export function DocumentView({ doc, lines, contact, person, company, branding, settings, items, domId = 'fin-doc-print' }: {
  doc: FinDocument; lines: DocLine[]; contact: Contact | null; person: ContactPerson | null;
  company: any; branding: Branding | null; settings: FinanceSettings; items?: CatalogItem[]; domId?: string;
}) {
  const inv = branding?.templates.invoice;
  const { fields, lists, totals: t, M, payRows } = documentData(doc, lines, contact, person, company, branding, settings, items);

  if (inv?.layout?.enabled) {
    return (
      <div id={domId} style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
        <GridDocument template={inv.layout} fields={fields} lists={lists} logo={branding?.logo_data_uri} />
      </div>
    );
  }

  const td = { padding: '4px 6px', borderBottom: '1px solid #eee' } as const;
  const right = { ...td, textAlign: 'right' as const };
  const sumRow = (label: string, value: string, bold = false, color?: string) => (
    <tr><td colSpan={3} style={{ textAlign: 'right', padding: '3px 6px', fontWeight: bold ? 700 : 400, color }}>{label}</td>
      <td style={{ textAlign: 'right', padding: '3px 6px', fontWeight: bold ? 700 : 400, color }}><CellValue text={value} /></td></tr>
  );
  return (
    <div id={domId} style={{ background: '#fff', borderRadius: 8, padding: 24 }}>
      <DocumentShell country={company?.country} branding={branding} companyName={company?.name || ''} forPrint title={fields.document_title}
        meta={<>{doc.number}<br />Date {fmtDate(doc.issue_date)}{doc.due_date ? <><br />{doc.doc_type === 'quote' ? 'Valid until' : 'Due'} {fmtDate(doc.due_date)}</> : null}{doc.reference ? <><br />Ref {doc.reference}</> : null}</>}
        showLogo={inv?.showLogo ?? true} showCompanyBlock={inv?.showCompanyBlock ?? true} footerNote={inv?.footerNote}>
        <div style={{ fontSize: 13, color: '#111', marginBottom: 12, whiteSpace: 'pre-line' }}>
          <div style={{ color: '#666', fontSize: 12 }}>{doc.doc_type === 'quote' ? 'Prepared for' : 'Bill to'}</div>
          <b>{fields.customer_name}</b>{fields.customer_address ? `\n${fields.customer_address}` : ''}
          {fields.customer_contact && <div style={{ fontSize: 12, marginTop: 2 }}>Attn: {fields.customer_contact}{[fields.customer_phone, fields.customer_email].filter(Boolean).length ? ` · ${[fields.customer_phone, fields.customer_email].filter(Boolean).join(' · ')}` : ''}</div>}
          {fields.deliver_to && <div style={{ marginTop: 8 }}><div style={{ color: '#666', fontSize: 12 }}>Deliver to</div><b>{fields.delivery_name}</b>{fields.delivery_address ? `\n${fields.delivery_address}` : ''}</div>}
          {fields.company_gst_no && <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>Our {taxRegLabel(company?.country)} {fields.company_gst_no}</div>}
        </div>
        <table style={{ width: '100%', fontSize: 13, color: '#111', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f2f2f2' }}>
              <th style={{ ...td, textAlign: 'left' }}>Description</th><th style={right}>Qty</th><th style={right}>Unit price</th><th style={right}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={{ ...td, whiteSpace: 'pre-line' }}>{l.description}{Number(l.discount_pct) ? <span style={{ color: '#888' }}> (less {Number(l.discount_pct)}%)</span> : null}</td>
                <td style={right}>{qtyText(l.quantity)}</td>
                <td style={right}><CellValue text={M(l.unit_price)} /></td>
                <td style={right}><CellValue text={M(t.lines[i])} /></td>
              </tr>
            ))}
            {sumRow('Subtotal', M(t.subtotal))}
            {lists.discounts.map((d, i) => <tr key={`d${i}`}><td colSpan={3} style={{ textAlign: 'right', padding: '3px 6px', color: '#15803d' }}>{d.name}</td><td style={{ textAlign: 'right', padding: '3px 6px', color: '#15803d' }}><CellValue text={fmtMoney(-t.discounts.filter(x => x > 0)[i], doc.currency, inv?.amountFormat)} /></td></tr>)}
            {t.tax_total > 0 && sumRow(doc.tax_inclusive ? 'GST included' : 'GST', M(t.tax_total))}
            {sumRow('Total', M(t.total), true)}
            {doc.doc_type === 'invoice' && Number(doc.amount_paid) > 0 && sumRow('Paid', M(-doc.amount_paid))}
            {doc.doc_type === 'invoice' && Number(doc.amount_paid) > 0 && sumRow('Balance due', M(balanceDue({ total: t.total, amount_paid: doc.amount_paid })), true, branding?.accent_color || undefined)}
          </tbody>
        </table>
        {(fields.notes || fields.terms) && (
          <div style={{ fontSize: 12, color: '#444', marginTop: 14, whiteSpace: 'pre-line' }}>
            {fields.notes && <div style={{ marginBottom: 6 }}>{fields.notes}</div>}
            {fields.terms && <div><b>Terms</b><br />{fields.terms}</div>}
          </div>
        )}
        {doc.doc_type !== 'quote' && (payRows.length > 0 || inv?.bankDetails) && (
          <div style={{ fontSize: 12, color: '#444', marginTop: 14 }}>
            <b>Payment details</b>
            {payRows.length ? (
              <table style={{ borderCollapse: 'collapse', marginTop: 4 }}><tbody>
                {payRows.map((r, i) => <tr key={i}><td style={{ paddingRight: 24, verticalAlign: 'top', whiteSpace: 'nowrap' }}>{r.label}</td><td style={{ whiteSpace: 'pre-line' }}>{r.value}</td></tr>)}
              </tbody></table>
            ) : <div style={{ whiteSpace: 'pre-line' }}>{inv?.bankDetails}</div>}
          </div>
        )}
      </DocumentShell>
    </div>
  );
}

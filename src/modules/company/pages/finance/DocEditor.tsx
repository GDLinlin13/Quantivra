import { useState, useEffect, useMemo, useRef } from 'react';
import { Drawer, Form, Select, DatePicker, Input, InputNumber, Button, Space, Table, Divider, Typography, message, Switch, Popconfirm, Alert, Tag, Segmented, Upload, ConfigProvider, Modal } from 'antd';
import { useCompanyAccess } from '../../../../contexts/CompanyAccess';
import { PlusOutlined, DeleteOutlined, HolderOutlined, PaperClipOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { docService, paymentService, catalogService, priceListService, supplierBills, attachmentService, contactService, latestRate, ATTACH_TYPES, type Attachment } from '../../../../services/finance';
import { ContactDrawer } from './ContactsManager';
import { ItemDrawer } from '../Catalog';
import { companyFileService } from '../../../../services/finance';
import { FileViewer } from '../../../../components/FileViewer';
import {
  docTotals, addDays, today, DOC_LABEL, DOC_NUMBER_ENTITY, contactCurrencies, STATUS_LABEL, STATUS_COLOR,
  type DocType, type FinDocument, type DocLine, type DocDiscount, type Contact, type ContactPerson, type FinanceSettings, type Account,
} from '../../../../data/finance';
import { money, paymentAccounts } from '../../../../data/documentLayouts';
import type { Branding } from '../../../../services/branding';
import { basisOf, costChanges, supplierPrices, classOf, classLabel, piecePrice, listPrice, kgText, type CatalogItem, type WeightClass, type Piece, type PriceListRow } from '../../../../data/catalog';
import { AmountInput } from '../../../../components/AmountInput';

const { Text } = Typography;

const blankLine = (rate: number): DocLine => ({ description: '', quantity: 1, unit_price: 0, discount_pct: 0, tax_rate: rate });

/** Create or edit a quotation, invoice, credit note, bill or expense. */
export function DocEditor({ companyId, docType: startType, docId, contacts: contactsIn, people: peopleIn, accounts, settings, branding, currency, employees = [], items: itemsIn = [], onClose, onSaved, onContactsChanged, onItemsChanged }: {
  companyId: number; docType: DocType; docId?: number | null;
  contacts: Contact[]; people: ContactPerson[]; accounts: Account[]; settings: FinanceSettings; branding: Branding | null; currency: string;
  employees?: { id: number; full_name: string }[];
  items?: CatalogItem[];
  onClose: () => void; onSaved: (id: number) => void;
  /** called after a customer / supplier was added from here, so the lists behind this screen refresh */
  onContactsChanged?: () => void;
  /** called after a catalog item was added from here */
  onItemsChanged?: () => void;
}) {
  // catalog items can be added from the Item dropdown, so this keeps its own copy
  const [items, setItems] = useState(itemsIn);
  useEffect(() => setItems(itemsIn), [itemsIn]);
  const [newItem, setNewItem] = useState<{ row: number; name: string } | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  // customers / suppliers can be added from the dropdown, so this keeps its own copy
  const [contacts, setContacts] = useState(contactsIn);
  const [people, setPeople] = useState(peopleIn);
  useEffect(() => setContacts(contactsIn), [contactsIn]);
  useEffect(() => setPeople(peopleIn), [peopleIn]);
  const [newContact, setNewContact] = useState<Partial<Contact> | null>(null);
  const [contactSearch, setContactSearch] = useState('');
  const access = useCompanyAccess();
  const canCatalog = access.canWrite('inventory');
  // a purchase can switch between a bill (pay later) and an expense (already paid / staff claim) until it's saved
  const [docType, setDocType] = useState<DocType>(startType);
  const sales = docType === 'quote' || docType === 'invoice' || docType === 'credit_note';
  const gstRate = settings.gstRegistered ? Number(settings.gstRate) || 0 : 0;
  const [doc, setDoc] = useState<Partial<FinDocument>>({});
  const [lines, setLines] = useState<DocLine[]>([blankLine(gstRate)]);
  const [discounts, setDiscounts] = useState<DocDiscount[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!!docId);
  const [files, setFiles] = useState<Attachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [viewFile, setViewFile] = useState<Attachment | null>(null);
  const loadFiles = () => { if (docId) attachmentService.list(docId).then(setFiles).catch(() => setFiles([])); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(loadFiles, [docId]);

  useEffect(() => {
    if (docId) {
      docService.get(docId).then(({ doc: d, lines: ls }) => {
        loadedPrices.current = new Map(ls.filter(l => l.id).map(l => [l.id!, Number(l.unit_price)]));
        setDoc(d); setDocType(d.doc_type); setLines(ls.length ? ls.map(l => ({ ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price), discount_pct: Number(l.discount_pct), tax_rate: Number(l.tax_rate) })) : [blankLine(gstRate)]);
        setDiscounts(d.discounts || []); setLoading(false);
      }).catch(e => { message.error(e.message); onClose(); });
    } else {
      const issue = today();
      const days = docType === 'quote' ? (settings.quoteValidityDays ?? 30) : (branding?.templates.invoice.paymentTermsDays ?? 30);
      setDoc({ doc_type: docType, status: 'draft', issue_date: issue, due_date: docType === 'expense' ? null : addDays(issue, days), currency, tax_inclusive: false, terms: sales ? settings.invoiceTerms || '' : '' });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId]);

  const set = (patch: Partial<FinDocument>) => setDoc(d => ({ ...d, ...patch }));
  // the number typed in on each document instead of counted (Settings → Document numbers), for sales documents
  const [typed, setTyped] = useState<Set<string>>(new Set());
  useEffect(() => { docService.typedNumbers(companyId).then(setTyped).catch(() => null); }, [companyId]);
  const typedNumber = sales && typed.has(DOC_NUMBER_ENTITY[docType]);
  // lines are numbered and can be dragged into another place
  const dragFrom = useRef<number | null>(null);
  // the prices lines had when this document was opened (an unchanged price is not asked about again)
  const loadedPrices = useRef(new Map<number, number>());
  const [dragOver, setDragOver] = useState<number | null>(null);
  const moveLine = (from: number, to: number) => {
    if (from === to) return;
    setLines(ls => { const next = [...ls]; const [x] = next.splice(from, 1); next.splice(to, 0, x); return next; });
  };
  const setLine = (i: number, patch: Partial<DocLine>) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const t = useMemo(() => docTotals(lines, discounts, !!doc.tax_inclusive), [lines, discounts, doc.tax_inclusive]);
  const M = (n: number) => money(n, doc.currency || currency);

  const contactList = contacts.filter(c => !c.archived && (sales ? c.is_customer : c.is_supplier) || c.id === doc.contact_id);
  const contactPeople = people.filter(p => p.contact_id === doc.contact_id);
  // What a line can be booked to: income for sales; for purchases, expenses plus the few asset accounts you can
  // buy into (prepayments, equipment) — never bank / cash / receivables, and not the payroll accounts payroll books itself.
  const AUTO = ['bank', 'cash', 'receivable', 'payroll', 'payroll_director', 'payroll_employer', 'payroll_employer_other', 'gratuity_expense'];
  const lineAccounts = accounts.filter(a => !a.archived && !AUTO.includes(a.subtype || '')
    && (sales ? a.type === 'income' : a.type === 'expense' || a.type === 'asset'));
  const accountOptions = sales
    ? lineAccounts.map(a => ({ value: a.id, label: `${a.code} ${a.name}` }))
    : [
      { label: 'Expenses', options: lineAccounts.filter(a => a.type === 'expense').map(a => ({ value: a.id, label: `${a.code} ${a.name}` })) },
      { label: 'Things you own (assets)', options: lineAccounts.filter(a => a.type === 'asset').map(a => ({ value: a.id, label: `${a.code} ${a.name}` })) },
    ];
  // items stocked by weight: their classes, the pieces, and which pieces are on an invoice already
  const [classes, setClasses] = useState<WeightClass[]>([]);
  const [pieces, setPieces] = useState<Piece[]>([]);
  const [soldOn, setSoldOn] = useState<{ piece_id: number; document_id: number }[]>([]);
  const byWeight = items.some(i => i.stock_mode === 'pieces');
  useEffect(() => {
    if (!byWeight) return;
    catalogService.classes(companyId).then(setClasses).catch(() => null);
    catalogService.pieces(companyId).then(setPieces).catch(() => null);
    catalogService.soldPieces(companyId).then(setSoldOn).catch(() => null);
  }, [companyId, byWeight]);
  const isPieces = (l: DocLine) => !!l.item_id && items.find(x => x.id === l.item_id)?.stock_mode === 'pieces';
  const weightOf = (l: DocLine) => l.weight ?? pieces.find(p => p.id === l.piece_id)?.weight ?? 0;
  const pieceSold = (id?: number | null) => !!id && soldOn.some(s => s.piece_id === id && s.document_id !== docId);
  // special prices for particular customers (Catalog → item → Customer prices)
  // Price lists (Catalog → Price lists): the customer buys at the prices of the list they are assigned to
  const [plRows, setPlRows] = useState<PriceListRow[]>([]);
  useEffect(() => { if (sales) priceListService.rows(companyId).then(setPlRows).catch(() => null); }, [companyId, sales]);
  // customers with no list of their own buy at the Standard price list
  const [stdId, setStdId] = useState<number | null>(null);
  useEffect(() => { if (sales) priceListService.standardId(companyId).then(setStdId).catch(() => setStdId(null)); }, [companyId, sales]);
  /** the price of an item (or one of its weight classes) for a customer: their list, then the Standard list, then what the item itself says */
  const sellPrice = (it: CatalogItem, contactId: number | null | undefined, classId: number | null = null): number | undefined => {
    const own = contacts.find(c => c.id === contactId)?.price_list_id;
    return listPrice(plRows, own, it.id, classId) ?? listPrice(plRows, stdId, it.id, classId);
  };
  // Currencies: the company's own and those of its bank accounts. A document in another currency needs the
  // exchange rate it is booked at (1 USD = x HKD), starting at the latest rate used.
  // …plus the currency the customer / supplier bills or pays in (CRM), even without a bank account in it
  const contactCurs = contactCurrencies(contacts.find(c => c.id === doc.contact_id));
  const currencies = [...new Set([currency, ...accounts.filter(a => !a.archived && (a.subtype === 'bank' || a.subtype === 'cash') && a.currency).map(a => a.currency!), ...contactCurs, ...(doc.currency ? [doc.currency] : [])])];
  const docCur = doc.currency || currency;
  // What this supplier charged before, from their earlier bills: the latest price per item (and weight class)
  const [billsOf, setBillsOf] = useState<any[]>([]);
  useEffect(() => {
    if (sales || !doc.contact_id) { setBillsOf([]); return; }
    supplierBills(companyId, doc.contact_id, docId).then(setBillsOf).catch(() => setBillsOf([]));
  }, [companyId, sales, doc.contact_id, docId]);
  const supplierHist = useMemo(() => supplierPrices(billsOf, items, classes, pieces, currency).filter(h => h.currency === docCur), [billsOf, items, classes, pieces, currency, docCur]);
  // the supplier's own tax (Contacts → supplier): charged or not, its name and rate; unset = the company's tax setting
  const taxOf = (cid: number | null | undefined) => {
    const c = !sales ? contacts.find(x => x.id === cid) : undefined;
    return c && c.tax_charged != null ? { on: !!c.tax_charged, name: (c.tax_name || '').trim() || 'Tax', rate: c.tax_charged ? Number(c.tax_rate) || 0 : 0 } : null;
  };
  const supTax = taxOf(doc.contact_id);
  const taxOn = settings.gstRegistered || !!supTax?.on;
  const taxName = supTax?.on ? supTax.name : 'GST';
  const supplierPrice = (itemId: number, classId: number | null = null) => supplierHist.find(h => h.item_id === itemId && (h.class_id ?? null) === (classId ?? null));
  const foreign = docCur !== currency;
  const [rates, setRates] = useState<Record<string, number | null>>({});
  const rateFor = async (cur: string) => {
    if (cur === currency) return null;
    if (rates[cur] !== undefined) return rates[cur];
    const r = await latestRate(companyId, cur, currency, doc.issue_date).catch(() => null);
    setRates(x => ({ ...x, [cur]: r }));
    return r;
  };
  const switchCurrency = async (cur: string, quiet = false) => {
    if (cur === docCur) return;
    const r = await rateFor(cur);
    // prices already on the lines move to the new currency through the company currency (when both rates are known)
    const fromRate = foreign ? Number(doc.fx_rate) || null : 1;
    const toRate = cur === currency ? 1 : r;
    if (fromRate && toRate) setLines(ls => ls.map(l => (Number(l.unit_price) ? { ...l, unit_price: Math.round(Number(l.unit_price) * fromRate / toRate * 100) / 100 } : l)));
    set({ currency: cur, fx_rate: cur === currency ? null : r });
    void quiet;
  };
  /** an item's price in this document's currency */
  const inDocCurrency = (price: number, itemCur: string | null | undefined) => {
    const from = itemCur || currency;
    if (from === docCur || !price) return price;
    const fromRate = from === currency ? 1 : rates[from];
    const toRate = docCur === currency ? 1 : Number(doc.fx_rate) || null;
    return fromRate && toRate ? Math.round(price * fromRate / toRate * 100) / 100 : price;
  };

  // sales documents offer what we sell, purchases what we buy (plus anything already on the lines)
  const catalog = items.filter(it => lines.some(l => l.item_id === it.id)
    || (!it.archived && (it.used_for || 'both') !== (sales ? 'purchases' : 'sales')));
  const pickItem = (i: number, id: number | null, from: CatalogItem[] = items) => {
    const it = from.find(x => x.id === id);
    if (!it) { setLine(i, { item_id: null }); return; }
    const price = sales ? (sellPrice(it, doc.contact_id) ?? (Number(it.sale_price) || 0)) : supplierPrice(it.id)?.price ?? (Number(it.purchase_price) || 0);
    // an item priced in another currency: a new document with nothing priced yet takes the item's currency
    // (a bought item can have its own buying currency, e.g. bought in MYR, sold in SGD)
    const itemCur = !sales && it.purchase_currency ? it.purchase_currency : it.currency;
    const empty = !lines.some((l, j) => j !== i && Number(l.unit_price));
    if (itemCur && itemCur !== docCur && empty && !Number(doc.amount_paid) && currencies.includes(itemCur)) {
      switchCurrency(itemCur, true).then(() => setLine(i, { unit_price: price }));
    } else if (itemCur && itemCur !== currency) rateFor(itemCur);
    setLine(i, {
      ...(it.stock_mode === 'pieces' ? { piece_id: null, weight: undefined, quantity: 0, unit_price: 0 } : {}),
      item_id: it.id, description: it.description || '', // the name prints first; Description is anything extra
      ...(it.stock_mode === 'pieces' ? {} : { unit_price: itemCur && itemCur !== docCur && !(empty && currencies.includes(itemCur)) ? inDocCurrency(price, itemCur) : price }),
      tax_rate: supTax ? supTax.rate : settings.gstRegistered ? (it.tax_rate == null ? gstRate : Number(it.tax_rate)) : 0,
      account_id: (sales ? it.income_account_id : it.expense_account_id) || null,
    });
  };
  /** A by-weight line takes its price from the class the piece's weight falls in. */
  const priceByWeight = (i: number, it: CatalogItem, weight: number, pieceId: number | null) => {
    const own = classes.filter(c => c.item_id === it.id);
    const cls = classOf(own, weight);
    const itemCur = !sales && it.purchase_currency ? it.purchase_currency : it.currency;
    const p = piecePrice(it, cls, weight, sales);
    // a price per class (the customer's list, the Standard list, or the supplier's last bill); with no classes, one price per KG
    if (cls || !own.length) {
      const lp = sales ? sellPrice(it, doc.contact_id, cls?.id ?? null) : supplierPrice(it.id, cls?.id ?? null)?.price;
      if (lp != null) p.unit_price = lp;
      else if (!cls) p.unit_price = Number(sales ? it.sale_price : it.purchase_price) || 0;
    }
    // the class goes in the Description (unless something else was typed there), so Qty stays readable
    const mine = own.map(c => classLabel(c));
    const desc = (lines[i]?.description || '').trim();
    const autoDesc = !desc || mine.includes(desc) ? (cls ? classLabel(cls) : '') : desc;
    setLine(i, { piece_id: pieceId, weight, quantity: p.quantity, unit_price: inDocCurrency(p.unit_price, itemCur), description: autoDesc });
    if (weight > 0 && !cls && own.length) message.warning(`No weight class for ${kgText(weight)} kg — add one in the catalog, or type the price`);
  };
  const payFrom = accounts.filter(a => !a.archived && (a.subtype === 'bank' || a.subtype === 'cash'));
  const banks = paymentAccounts(branding?.templates.invoice);

  const pickContact = (id: number) => {
    const c = contacts.find(x => x.id === id);
    const main = people.filter(p => p.contact_id === id).sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary))[0];
    const patch: Partial<FinDocument> = { contact_id: id, contact_person_id: main?.id ?? null };
    if (c?.payment_terms_days != null && docType !== 'quote' && doc.issue_date) patch.due_date = addDays(doc.issue_date, c.payment_terms_days);
    set(patch);
    // a bill from a supplier with a tax setting: the lines take that tax
    if (!sales) { const t = taxOf(id); if (t) setLines(ls => ls.map(l => ({ ...l, tax_rate: t.rate }))); }
    // a new document takes the currency this customer / supplier works in (CRM), unless something is paid already
    const first = contactCurrencies(c)[0];
    if (!docId && first && first !== docCur && !Number(doc.amount_paid)) setTimeout(() => switchCurrency(first, true));
    // catalog lines still at the previous customer's price move to this customer's price
    if (sales) {
      let changed = 0;
      setLines(ls => ls.map(l => {
        const it = l.item_id ? items.find(x => x.id === l.item_id) : undefined;
        if (!it || it.stock_mode === 'pieces' || Math.abs(Number(l.unit_price) - (sellPrice(it, doc.contact_id) ?? (Number(it.sale_price) || 0))) > 0.005) return l;
        const p = sellPrice(it, id) ?? (Number(it.sale_price) || 0);
        if (Math.abs(p - Number(l.unit_price)) > 0.005) changed++;
        return { ...l, unit_price: p };
      }));
      setTimeout(() => { if (changed) message.info(`Prices updated to ${c?.name || 'this customer'}'s prices`); });
    }
  };

  const save = async (status?: string) => {
    if (docType !== 'expense' && !doc.contact_id) { message.error(sales ? 'Choose a customer' : 'Choose a supplier'); return; }
    if (!lines.some(l => (l.description || '').trim() || l.item_id || Number(l.unit_price))) { message.error('Add at least one line'); return; }
    if (typedNumber && !(doc.number || '').trim()) { message.error(`Enter the ${DOC_LABEL[docType].toLowerCase()} number`); return; }
    // the supplier's own invoice number can only be recorded once
    if (!sales && doc.contact_id && (doc.reference || '').trim()) {
      const dup = await docService.duplicateReference(companyId, doc.contact_id, doc.reference || '', docId).catch(() => null);
      if (dup) { message.error(`Invoice number ${(doc.reference || '').trim()} is already recorded for this supplier (${dup.number}).`); return; }
    }
    for (const l of lines) {
      if (!isPieces(l)) continue;
      const nm = items.find(x => x.id === l.item_id)?.name;
      if (sales && docType === 'invoice' && !l.piece_id) { message.error(`Choose the piece of ${nm} to sell`); return; }
      if (!sales && !(weightOf(l) > 0)) { message.error(`Enter the weight of each ${nm} piece`); return; }
    }
    // the books (in the company's currency) need a rate; none typed: the latest known, else today's market rate
    let fx = doc.fx_rate;
    if (foreign && !(Number(fx) > 0)) {
      fx = await latestRate(companyId, docCur, currency, doc.issue_date).catch(() => null);
      if (!fx) { message.error(`Couldn't find a ${docCur} rate — enter it: 1 ${docCur} = ? ${currency}`); return; }
      set({ fx_rate: fx });
    }
    // a bill at a different price from this supplier's last one: ask whether it becomes their price from now on
    let toSave = lines;
    if (!sales) {
      const withWeight = lines.map(l => (isPieces(l) ? { ...l, weight: weightOf(l) } : l));
      const changes = costChanges(withWeight, items, classes, docCur, currency,
        (i, c) => { const h = supplierPrice(i, c); return h ? { price: h.price, date: h.date, number: h.number } : undefined; })
        .map(c => ({ ...c, lines: c.lines.filter(ix => { const l = lines[ix]; return !(l.id && loadedPrices.current.get(l.id) === Number(l.unit_price)) && !l.price_one_off; }) }))
        .filter(c => c.since && c.lines.length);
      if (changes.length) {
        const update = await new Promise<boolean>(resolve => { Modal.confirm({
          title: 'Prices changed from this supplier’s last bill', okText: 'Yes, update the price', cancelText: 'No, this bill only', width: 580,
          content: (
            <div>
              {changes.map((c, i) => (
                <div key={i} style={{ fontSize: 13 }}>
                  <b>{c.name}</b>{c.label ? ` (${c.label})` : ''}: {docCur} {c.old.toLocaleString(undefined, { maximumFractionDigits: 4 })} → <b>{c.price.toLocaleString(undefined, { maximumFractionDigits: 4 })}</b>
                  <span style={{ color: '#999' }}> ({c.price > c.old ? '▲' : '▼'} {Math.abs(Math.round(((c.price - c.old) / c.old) * 1000) / 10)}% · was on {c.since})</span>
                </div>
              ))}
              <div style={{ marginTop: 8 }}>Update this supplier’s price for next time?</div>
              <div style={{ color: '#999', fontSize: 12 }}>No: this bill keeps its price, but the supplier’s price stays as it was.</div>
            </div>
          ),
          onOk: () => resolve(true), onCancel: () => resolve(false),
        }); });
        if (!update) {
          const oneOff = new Set(changes.flatMap(c => c.lines));
          toSave = lines.map((l, ix) => (oneOff.has(ix) ? { ...l, price_one_off: true } : l));
        }
      }
    }
    setSaving(true);
    try {
      const id = await docService.save(companyId, { ...doc, ...(foreign ? { fx_rate: fx } : {}), ...(typedNumber ? { number: (doc.number || '').trim() } : {}), doc_type: docType, discounts, ...(status ? { status: status as any } : {}) } as any, toSave, { keepNumber: typedNumber });
      // pieces bought: one piece per line, with its weight
      if (!sales && lines.some(isPieces)) await catalogService.syncBillPieces(companyId, id, doc.issue_date!, lines.map(l => (isPieces(l) ? { ...l, weight: weightOf(l) } : l)), items, classes);
      // An expense paid on the spot (from a bank / cash account) is recorded as paid straight away.
      if (docType === 'expense' && doc.paid_from_account_id && (status === 'approved' || doc.status === 'approved')) {
        const { doc: fresh } = await docService.get(id);
        const owed = Math.round(((Number(fresh.total) || 0) - (Number(fresh.amount_paid) || 0)) * 100) / 100;
        if (owed > 0) {
          // in the company's currency; from a bank in the expense's own currency, that amount went out of it
          const from = accounts.find(a => a.id === doc.paid_from_account_id);
          const sameCur = foreign && from?.currency === docCur;
          await paymentService.record(companyId, {
            direction: 'out', amount: foreign ? Math.round(owed * Number(fx) * 100) / 100 : owed, contact_id: fresh.contact_id, payment_date: fresh.issue_date,
            method: 'Paid on the spot', account_id: doc.paid_from_account_id,
            ...(sameCur ? { currency: docCur, foreign_amount: owed } : {}),
          }, [{ document_id: id, amount: owed }]);
        }
      }
      // files picked before the first save are uploaded now
      for (const f of pendingFiles) { try { await attachmentService.add(companyId, id, f); } catch (e: any) { message.error(e.message); } }
      message.success(`${DOC_LABEL[docType]} saved`);
      onSaved(id);
    } catch (e: any) { message.error(/duplicate|unique/i.test(e.message) ? `${DOC_LABEL[docType]} number ${doc.number} is already used` : e.message); }
    setSaving(false);
  };

  const dateLabel = docType === 'quote' ? 'Valid until' : docType === 'expense' ? 'Paid on' : 'Due date';
  const issued = doc.status && doc.status !== 'draft';
  // view-only roles see the document but cannot change it
  const canWrite = access.canWrite('finance');
  return (
    <Drawer open onClose={onClose} size={Math.min(1440, window.innerWidth - 24)} loading={loading}
      title={<Space>{docId ? `${DOC_LABEL[docType]} ${doc.number || ''}` : `New ${DOC_LABEL[docType].toLowerCase()}`}{doc.status && <Tag color={STATUS_COLOR[doc.status]}>{STATUS_LABEL[doc.status]}</Tag>}</Space>}
      extra={canWrite &&
        <Space>
          {(!issued || doc.status === 'void') && <Button loading={saving} onClick={() => save()}>Save draft</Button>}
          {!issued && (
            <Button type="primary" loading={saving} onClick={() => save(sales ? 'sent' : 'approved')}>
              {sales ? 'Save & mark as sent' : 'Save & approve'}
            </Button>
          )}
          {issued && doc.status !== 'void' && <Button type="primary" loading={saving} onClick={() => save()}>Save changes</Button>}
        </Space>
      }>
      <ConfigProvider componentDisabled={!canWrite}>
      {Number(doc.amount_paid) > 0 && <Alert type="info" showIcon style={{ marginBottom: 12 }} title={`${M(Number(doc.amount_paid))} has been paid on this ${DOC_LABEL[docType].toLowerCase()}.`} />}
      {!sales && !docId && (
        <Segmented style={{ marginBottom: 12 }} value={docType} onChange={v => {
          const t = v as DocType;
          setDocType(t);
          const c = contacts.find(x => x.id === doc.contact_id);
          const days = c?.payment_terms_days ?? (branding?.templates.invoice.paymentTermsDays ?? 30);
          set(t === 'expense' ? { due_date: null } : { due_date: doc.issue_date ? addDays(doc.issue_date, days) : null, paid_from_account_id: null, employee_id: null });
        }} options={[{ value: 'bill', label: 'To pay later' }, { value: 'expense', label: 'Already paid' }]} />
      )}
      <Form layout="vertical">
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 1fr', gap: 12, alignItems: 'end' }}>
          <Form.Item label={sales ? 'Customer' : 'Supplier'} required={docType !== 'expense'}>
            <Select showSearch optionFilterProp="label" value={doc.contact_id ?? undefined} onChange={pickContact} allowClear={docType === 'expense'}
              options={contactList.map(c => ({ value: c.id, label: c.name }))} placeholder={sales ? 'Choose a customer' : 'Choose a supplier'}
              onSearch={setContactSearch} onOpenChange={o => { if (!o) setContactSearch(''); }}
              notFoundContent={`No ${sales ? 'customers' : 'suppliers'} yet`}
              popupRender={menu => (
                <>
                  {menu}
                  {access.canWrite('crm') && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: 4 }}>
                      <Button type="link" icon={<PlusOutlined />} style={{ width: '100%', textAlign: 'left' }}
                        onClick={() => setNewContact({ name: contactSearch.trim(), is_customer: sales, is_supplier: !sales })}>
                        {contactSearch.trim() ? `Add “${contactSearch.trim()}” as a new ${sales ? 'customer' : 'supplier'}` : `Add a new ${sales ? 'customer' : 'supplier'}`}
                      </Button>
                    </div>
                  )}
                </>
              )} />
          </Form.Item>
          <Form.Item label="Person in charge">
            <Select allowClear value={doc.contact_person_id ?? undefined} onChange={v => set({ contact_person_id: v ?? null })}
              options={contactPeople.map(p => ({ value: p.id, label: p.name + (p.designation ? ` (${p.designation})` : '') }))} />
          </Form.Item>
          <Form.Item label={docType === 'bill' ? 'Bill date' : 'Date'}>
            <DatePicker style={{ width: '100%' }} allowClear={false} value={doc.issue_date ? dayjs(doc.issue_date) : null}
              onChange={d => {
                // the due date follows the date: customer's payment terms, else the default terms (quotations: validity)
                const issue = d ? d.format('YYYY-MM-DD') : today();
                const c = contacts.find(x => x.id === doc.contact_id);
                const days = docType === 'quote' ? (settings.quoteValidityDays ?? 30)
                  : c?.payment_terms_days != null ? c.payment_terms_days : (branding?.templates.invoice.paymentTermsDays ?? 30);
                set({ issue_date: issue, ...(docType === 'expense' ? {} : { due_date: addDays(issue, days) }) });
              }} />
          </Form.Item>
          {docType !== 'expense' ? (
            <Form.Item label={dateLabel}>
              <DatePicker style={{ width: '100%' }} value={doc.due_date ? dayjs(doc.due_date) : null} onChange={d => set({ due_date: d ? d.format('YYYY-MM-DD') : null })} />
            </Form.Item>
          ) : (
            <Form.Item label="Paid from">
              <Select allowClear value={doc.paid_from_account_id ?? undefined} onChange={v => set({ paid_from_account_id: v ?? null })}
                options={payFrom.map(a => ({ value: a.id, label: a.name }))} placeholder="Not paid yet" />
            </Form.Item>
          )}
          {typedNumber ? (
            <Form.Item label={`${DOC_LABEL[docType]} no.`} required>
              <Input value={doc.number || ''} onChange={e => set({ number: e.target.value })} />
            </Form.Item>
          ) : (
            <Form.Item label={sales ? 'Reference / PO no.' : 'Invoice no.'}>
              <Input value={doc.reference || ''} onChange={e => set({ reference: e.target.value })}
                onBlur={() => { if (doc.reference && doc.reference !== doc.reference.trim()) set({ reference: doc.reference.trim() }); if (!sales && doc.contact_id && (doc.reference || '').trim()) docService.duplicateReference(companyId, doc.contact_id, doc.reference || '', docId).then(d => { if (d) message.error(`Invoice number ${(doc.reference || '').trim()} is already recorded for this supplier (${d.number}).`); }).catch(() => null); }} />
            </Form.Item>
          )}
        </div>
        {currencies.length > 1 && (
          <Space wrap align="center" style={{ marginBottom: 12 }}>
            <Text>Currency</Text>
            <Select style={{ width: 110 }} value={docCur} disabled={Number(doc.amount_paid) > 0} onChange={v => switchCurrency(v)}
              options={currencies.map(c => ({ value: c, label: c }))} />
            {foreign && (
              <AmountInput min={0} precision={6} style={{ width: 230 }} prefix={`1 ${docCur} =`} suffix={currency}
                value={doc.fx_rate ?? undefined} disabled={Number(doc.amount_paid) > 0} placeholder="today's rate"
                onChange={v => set({ fx_rate: v == null ? null : Number(v) })} />
            )}
            {foreign && Number(doc.fx_rate) > 0 && <Text type="secondary">= {money(Math.round(t.total * Number(doc.fx_rate) * 100) / 100, currency)}</Text>}
          </Space>
        )}
        {docId && doc.number && !typedNumber && <Text type="secondary" style={{ display: 'block', marginTop: -8, marginBottom: 8 }}>Number {doc.number}</Text>}
      </Form>

      {/* Enter moves to the same box on the next line (a new line after the last one); Shift+Enter keeps a new line in a description */}
      <div onKeyDown={e => {
        const el = e.target as HTMLElement;
        if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return;
        if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
        if (el.getAttribute('aria-expanded') === 'true') return;           // choosing from an open dropdown
        const td = el.closest('td'), tr = td?.parentElement as HTMLTableRowElement | null;
        if (!td || !tr || !tr.closest('.ant-table-tbody')) return;
        e.preventDefault();
        const col = Array.from(tr.children).indexOf(td);
        const focusIn = (row: Element | null) => {
          const box = row?.children[col]?.querySelector<HTMLElement>('textarea, input:not([type=hidden]):not([disabled])');
          if (box) { box.focus(); (box as HTMLInputElement).select?.(); return true; }
          return false;
        };
        const next = tr.nextElementSibling;
        if (next && !next.classList.contains('ant-table-placeholder') && focusIn(next)) return;
        if (next) return;
        setLines(ls => [...ls, blankLine(gstRate)]);
        setTimeout(() => focusIn(tr.parentElement?.lastElementChild ?? null), 60);
      }}>
      <Table rowKey="_row" size="small" pagination={false} dataSource={lines.map((l, i) => ({ ...l, _row: i }))}
        onRow={(r: any) => ({
          onDragOver: e => { if (dragFrom.current != null) { e.preventDefault(); setDragOver(r._row); } },
          onDrop: e => { e.preventDefault(); if (dragFrom.current != null) moveLine(dragFrom.current, r._row); dragFrom.current = null; setDragOver(null); },
          style: dragOver === r._row && dragFrom.current != null && dragFrom.current !== r._row ? { outline: '2px solid #c7ceea', outlineOffset: -2 } : undefined,
        })}
        columns={[
          { title: '#', width: 62, render: (_: any, __: DocLine, i: number) => (
            <span draggable onDragStart={e => { dragFrom.current = i; e.dataTransfer.effectAllowed = 'move'; }} onDragEnd={() => { dragFrom.current = null; setDragOver(null); }}
              title="Drag to move this line" style={{ cursor: 'grab', color: '#999', whiteSpace: 'nowrap', userSelect: 'none' }}>
              <HolderOutlined style={{ color: '#666', marginRight: 4 }} />{i + 1}
            </span>) },
          ...(catalog.length || access.canWrite('inventory') ? [{ title: 'Item', width: 240, render: (_: any, l: DocLine, i: number) => (
            <Select style={{ width: '100%' }} allowClear showSearch optionFilterProp="label" value={l.item_id ?? undefined} placeholder="From the catalog"
              onChange={v => pickItem(i, v ?? null)} onSearch={setItemSearch} onOpenChange={o => { if (!o) setItemSearch(''); }}
              options={catalog.map(it => ({ value: it.id, label: `${it.code ? `${it.code} · ` : ''}${it.name}` }))}
              popupRender={menu => (
                <>
                  {menu}
                  {access.canWrite('inventory') && (
                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: 4 }}>
                      <Button type="link" icon={<PlusOutlined />} style={{ width: '100%', textAlign: 'left' }}
                        onClick={() => setNewItem({ row: i, name: itemSearch.trim() })}>
                        {itemSearch.trim() ? `Add “${itemSearch.trim()}” to the catalog` : 'Add a new item to the catalog'}
                      </Button>
                    </div>
                  )}
                </>
              )} />
          ) }] : []),
          { title: 'Description', render: (_, l, i) => <Input.TextArea style={{ minWidth: 280 }} autoSize={{ minRows: 1, maxRows: 6 }} value={l.description} onChange={e => setLine(i, { description: e.target.value })} /> },
          ...(lineAccounts.length && !sales ? [{ title: 'Account', width: 240, render: (_: any, l: DocLine, i: number) => (
            <Select style={{ width: '100%' }} showSearch optionFilterProp="label" value={l.account_id ?? undefined} onChange={v => setLine(i, { account_id: v })}
              options={accountOptions as any} placeholder="General expenses" />
          ) }] : []),
          { title: 'Qty', width: items.some(x => x.stock_mode && x.stock_mode !== 'normal') ? 150 : 80, render: (_, l, i) => {
            const it = isPieces(l) ? items.find(x => x.id === l.item_id)! : null;
            if (it && sales && docType !== 'credit_note') {
              // sell a piece: only what is in stock, each piece once
              const taken = new Set(lines.filter((x, j) => j !== i && x.piece_id).map(x => x.piece_id));
              const list = pieces.filter(p => p.item_id === it.id && (p.id === l.piece_id || (!pieceSold(p.id) && !taken.has(p.id))))
                .sort((a, b) => a.weight - b.weight);
              return <Select style={{ width: '100%' }} showSearch optionFilterProp="label" placeholder="Choose a piece" value={l.piece_id ?? undefined}
                optionLabelProp="short" options={list.map(p => { const c = classes.find(x => x.id === p.class_id); return { value: p.id, short: `${kgText(p.weight)} kg`, label: `${kgText(p.weight)} kg${c ? ` · ${classLabel(c)}` : ''}` }; })}
                notFoundContent="No pieces in stock"
                onChange={v => { const p = pieces.find(x => x.id === v); if (p) priceByWeight(i, it, p.weight, p.id); }} />;
            }
            if (it && !sales) {
              return <Space.Compact style={{ width: '100%' }}>
                <InputNumber style={{ width: '100%' }} min={0} precision={3} placeholder="Weight" value={weightOf(l) || undefined} disabled={pieceSold(l.piece_id)}
                  onChange={v => priceByWeight(i, it, Number(v) || 0, l.piece_id ?? null)} />
                <Space.Addon>kg</Space.Addon>
              </Space.Compact>;
            }
            const loose = l.item_id ? items.find(x => x.id === l.item_id) : null;
            if (loose?.stock_mode === 'loose' && loose.loose_unit && Number(loose.loose_factor) > 0) {
              // typed in the small unit (g); the line keeps the item's own unit (kg)
              const f = Number(loose.loose_factor);
              return <Space.Compact style={{ width: '100%' }}>
                <InputNumber style={{ width: '100%' }} min={0} value={Math.round(Number(l.quantity) * f * 10000) / 10000} onChange={v => setLine(i, { quantity: Math.round(((Number(v) || 0) / f) * 1e6) / 1e6 })} />
                <Space.Addon>{loose.loose_unit}</Space.Addon>
              </Space.Compact>;
            }
            return <InputNumber style={{ width: '100%' }} value={l.quantity} onChange={v => setLine(i, { quantity: Number(v) || 0 })} />;
          } },
          { title: 'Unit price', width: 120, render: (_, l, i) => {
            const it = l.item_id ? items.find(x => x.id === l.item_id) : null;
            const per = it && (it.stock_mode === 'loose' || (it.stock_mode === 'pieces' && basisOf(it, sales) !== 'per_piece')) ? `/ ${it.stock_mode === 'pieces' ? 'kg' : it.unit || ''}` : undefined;
            return <AmountInput style={{ width: '100%' }} precision={2} suffix={per} value={l.unit_price} onChange={v => setLine(i, { unit_price: Number(v) || 0 })} />;
          } },
          { title: 'Disc %', width: 80, render: (_, l, i) => <InputNumber style={{ width: '100%' }} min={0} max={100} value={l.discount_pct} onChange={v => setLine(i, { discount_pct: Number(v) || 0 })} /> },
          ...(taxOn ? [{ title: `${taxName} %`, width: 90, render: (_: any, l: DocLine, i: number) => (
            <Select style={{ width: '100%' }} value={Number(l.tax_rate)} onChange={v => setLine(i, { tax_rate: v })}
              options={[...new Set([0, gstRate, ...(supTax?.on ? [supTax.rate] : []), Number(l.tax_rate)])].sort((a, b) => a - b).map(r => ({ value: r, label: `${r}%` }))} />
          ) }] : []),
          { title: 'Amount', width: 150, align: 'right' as const, render: (_: any, l: DocLine, i: number) => (
            // typing the amount works the unit price out: amount / (qty after the line's discount)
            <AmountInput style={{ width: '100%' }} precision={2} value={t.lines[i] || 0}
              onChange={v => {
                const amount = Number(v) || 0;
                const keep = 1 - (Number(l.discount_pct) || 0) / 100;
                const qty = Number(l.quantity) || 0;
                if (qty > 0 && keep > 0) setLine(i, { unit_price: Math.round((amount / (qty * keep)) * 1e6) / 1e6 });
                else if (keep > 0) setLine(i, { quantity: 1, unit_price: Math.round((amount / keep) * 1e6) / 1e6 });
              }} />) },
          { title: '', width: 40, render: (_, __, i) => <Button size="small" icon={<DeleteOutlined />} onClick={() => setLines(ls => ls.length > 1 ? ls.filter((_, j) => j !== i) : [blankLine(gstRate)])} /> },
        ]} />
      </div>
      <Button size="small" icon={<PlusOutlined />} style={{ marginTop: 8 }} onClick={() => setLines(ls => [...ls, blankLine(gstRate)])}>Add a line</Button>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 24, marginTop: 16 }}>
        <div>
          <Divider titlePlacement="start" style={{ marginTop: 0 }}>Discounts</Divider>
          {discounts.map((d, i) => (
            <Space key={i} style={{ marginBottom: 6 }} wrap>
              <Input style={{ width: 220 }} placeholder="e.g. Loyalty discount" value={d.name} onChange={e => setDiscounts(ds => ds.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
              <Select style={{ width: 90 }} value={d.kind} onChange={v => setDiscounts(ds => ds.map((x, j) => (j === i ? { ...x, kind: v } : x)))}
                options={[{ value: 'percent', label: '%' }, { value: 'amount', label: doc.currency || currency }]} />
              <InputNumber style={{ width: 110 }} min={0} value={d.value} onChange={v => setDiscounts(ds => ds.map((x, j) => (j === i ? { ...x, value: Number(v) || 0 } : x)))} />
              <Button icon={<DeleteOutlined />} onClick={() => setDiscounts(ds => ds.filter((_, j) => j !== i))} />
            </Space>
          ))}
          <div><Button size="small" icon={<PlusOutlined />} onClick={() => setDiscounts(ds => [...ds, { name: '', kind: 'percent', value: 0 }])}>Add a discount</Button></div>

          <Form layout="vertical" style={{ marginTop: 16 }}>
            {sales && banks.length > 1 && docType !== 'quote' && (
              <Form.Item label="Payment details to show">
                <Select value={doc.payment_account_index ?? banks.findIndex(b => b.isDefault)} onChange={v => set({ payment_account_index: v })}
                  options={banks.map((b, i) => ({ value: i, label: b.title || `Bank ${i + 1}` }))} />
              </Form.Item>
            )}
            {docType === 'expense' && (
              <Form.Item label="Claimed by (staff member who paid)">
                <Select allowClear showSearch optionFilterProp="label" value={doc.employee_id ?? undefined} onChange={v => set({ employee_id: v ?? null })}
                  options={employees.map(e => ({ value: e.id, label: e.full_name }))} placeholder="Nobody — the company paid" />
              </Form.Item>
            )}
            <Form.Item label="Notes"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={doc.notes || ''} onChange={e => set({ notes: e.target.value })} /></Form.Item>
            <Form.Item label="Attachments">
              <Space orientation="vertical" size={4} style={{ width: "100%" }}>
                {files.map(f => (
                  <Space key={f.id} size={4}>
                    <PaperClipOutlined />
                    <a onClick={() => setViewFile(f)}>{f.file_name}</a>
                    <Popconfirm title={`Remove ${f.file_name}?`} onConfirm={async () => { try { await attachmentService.remove(f); loadFiles(); } catch (e: any) { message.error(e.message); } }}>
                      <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                ))}
                {pendingFiles.map((f, i) => (
                  <Space key={`p${i}`} size={4}>
                    <PaperClipOutlined /><span>{f.name}</span>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} onClick={() => setPendingFiles(ps => ps.filter((_, j) => j !== i))} />
                  </Space>
                ))}
                <Upload accept={ATTACH_TYPES} multiple showUploadList={false} beforeUpload={file => {
                  if (docId) {
                    attachmentService.add(companyId, docId, file).then(loadFiles).catch(e => message.error(e.message));
                  } else setPendingFiles(ps => [...ps, file]);
                  return false;
                }}>
                  <Button size="small" icon={<UploadOutlined />}>Attach file</Button>
                </Upload>
              </Space>
            </Form.Item>
            {sales && <Form.Item label="Terms"><Input.TextArea autoSize={{ minRows: 2, maxRows: 6 }} value={doc.terms || ''} onChange={e => set({ terms: e.target.value })} /></Form.Item>}
          </Form>
        </div>
        <div>
          <table style={{ width: '100%', fontSize: 14 }}>
            <tbody>
              <tr><td>Subtotal</td><td style={{ textAlign: 'right' }}>{M(t.subtotal)}</td></tr>
              {discounts.map((d, i) => t.discounts[i] > 0 && <tr key={i}><td style={{ color: '#73d13d' }}>{d.name || 'Discount'}{d.kind === 'percent' ? ` (${d.value}%)` : ''}</td><td style={{ textAlign: 'right', color: '#73d13d' }}>-{M(t.discounts[i])}</td></tr>)}
              {taxOn && <tr><td>{taxName}{doc.tax_inclusive ? ' (included)' : ''}</td><td style={{ textAlign: 'right' }}>{M(t.tax_total)}</td></tr>}
              <tr><td style={{ fontWeight: 700, fontSize: 16, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 6 }}>Total</td>
                <td style={{ textAlign: 'right', fontWeight: 700, fontSize: 16, borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 6 }}>{M(t.total)}</td></tr>
            </tbody>
          </table>
          {taxOn && (
            <Space style={{ marginTop: 10 }}>
              <Switch size="small" checked={!!doc.tax_inclusive} onChange={v => set({ tax_inclusive: v })} />
              <Text type="secondary">Prices already include {taxName}</Text>
            </Space>
          )}
        </div>
      </div>
      {docId && doc.status === 'void' && <Alert type="warning" showIcon style={{ marginTop: 16 }} title="This document is void. Saving it as a draft brings it back." />}
      {canWrite && docId && !['void', 'paid'].includes(doc.status || '') && (
        <div style={{ marginTop: 24 }}>
          <Popconfirm title={`Void this ${DOC_LABEL[docType].toLowerCase()}?`} description="It stays on record but no longer counts."
            onConfirm={async () => { await docService.setStatus(docId, 'void'); message.success('Voided'); onSaved(docId); }}>
            <Button danger>Void</Button>
          </Popconfirm>
        </div>
      )}
      </ConfigProvider>
      {newItem && (
        <ItemDrawer companyId={companyId} item={{ kind: 'product', name: newItem.name, used_for: sales ? 'sales' : 'purchases' } as any} accounts={accounts} settings={settings}
          currency={currency}
          onClose={() => setNewItem(null)}
          onSaved={async id => {
            const row = newItem.row;
            setNewItem(null); setItemSearch('');
            try {
              const list = await catalogService.list(companyId);
              setItems(list);
              pickItem(row, id, list);
            } catch (e: any) { message.error(e.message); }
            onItemsChanged?.();
          }} />
      )}
      {newContact && (
        <ContactDrawer companyId={companyId} contact={newContact} word={sales ? 'customer' : 'supplier'} currency={currency} docs={[]}
          onClose={() => setNewContact(null)}
          onSaved={async id => {
            setNewContact(null); setContactSearch('');
            try {
              const [list, ppl] = await Promise.all([contactService.list(companyId), contactService.peopleOf(companyId)]);
              setContacts(list); setPeople(ppl);
              const c = list.find(x => x.id === id);
              const main = ppl.filter(p => p.contact_id === id).sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary))[0];
              set({ contact_id: id, contact_person_id: main?.id ?? null, ...(c?.payment_terms_days != null && docType !== 'quote' && doc.issue_date ? { due_date: addDays(doc.issue_date, c.payment_terms_days) } : {}) });
            } catch (e: any) { message.error(e.message); }
            onContactsChanged?.();
          }} />
      )}
      {viewFile && <FileViewer name={viewFile.file_name} load={() => companyFileService.blob(viewFile.path)} onClose={() => setViewFile(null)} />}
    </Drawer>
  );
}

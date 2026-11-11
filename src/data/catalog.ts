// Catalog: products and services, and how much stock is on hand.

export interface CatalogItem {
  id: number; company_id: number; kind: 'product' | 'service'; code: string | null; name: string;
  description: string | null; unit: string | null; sale_price: number; purchase_price: number;
  tax_rate: number | null; income_account_id: number | null; expense_account_id: number | null;
  track_stock: boolean; opening_qty: number; reorder_level: number | null; category: string | null; archived: boolean;
  /** sold, bought or both (migration 030) */
  used_for?: 'sales' | 'purchases' | 'both';
  /** the currency of the item's prices; empty = the company's currency (migration 036) */
  currency?: string | null;
  /** the currency of the cost / buying price when it differs from `currency` (migration 045) */
  purchase_currency?: string | null;
  /** normal; pieces = each piece has its own weight and is sold once; loose = any amount of a small unit (migration 046) */
  stock_mode?: StockMode;
  /** pieces: the buying (cost) prices of the classes are per KG (x the piece's weight) or one price per piece */
  price_basis?: 'per_kg' | 'per_piece';
  /** pieces: the same for the selling prices; empty = as price_basis (migration 047) */
  sale_basis?: 'per_kg' | 'per_piece' | null;
  /** loose: the small unit ("g") and how many make one item unit (1 kg = 1000 g) */
  loose_unit?: string | null; loose_factor?: number | null;
}
export type StockMode = 'normal' | 'pieces' | 'loose';

/** A weight class of an item, e.g. 2 – 2.99 kg, with its own prices (migration 046). */
export interface WeightClass { id?: number; item_id?: number; min_kg: number; max_kg: number | null; sale_price: number; purchase_price: number }
/** One piece bought: its own weight, sold once. `document_id` is the bill it came in on (empty = received by hand). */
export interface Piece { id: number; item_id: number; weight: number; class_id: number | null; document_id: number | null; received_date: string; note: string | null }

export const kgText = (n: number) => `${Math.round((Number(n) || 0) * 1000) / 1000}`;

/** "2 – 2.99 kg", "10 kg and above" */
export function classLabel(c: Pick<WeightClass, 'min_kg' | 'max_kg'>): string {
  return c.max_kg == null ? `${kgText(c.min_kg)} kg and above` : `${kgText(c.min_kg)} – ${kgText(c.max_kg)} kg`;
}

/**
 * The weight class a piece falls in: the highest class starting at or below its weight. Weights in the sliver
 * between two classes (2.995 kg between 2 – 2.99 and 3 – 3.99) belong to the lower one; real gaps: none.
 */
export function classOf<T extends Pick<WeightClass, 'min_kg' | 'max_kg'>>(classes: T[], weight: number): T | null {
  const w = Number(weight) || 0;
  const sorted = [...classes].sort((a, b) => Number(a.min_kg) - Number(b.min_kg));
  let hit: T | null = null, next: T | undefined;
  sorted.forEach((c, i) => { if (Number(c.min_kg) <= w) { hit = c; next = sorted[i + 1]; } });
  const h = hit as T | null;
  if (!h) return null;
  if (h.max_kg == null) return h;
  // weights just above a limit (2.995 after 2.99) still belong to it, up to the next class
  return w <= Number(h.max_kg) || (next && w < Number(next.min_kg) && w < Number(h.max_kg) + 0.01) ? h : null;
}

/** What a piece is priced at: the class price x its weight, or the class price as it stands. */
export const basisOf = (item: Pick<CatalogItem, 'price_basis' | 'sale_basis'>, sales: boolean) => (sales ? item.sale_basis || item.price_basis : item.price_basis) || 'per_kg';

export function piecePrice(item: Pick<CatalogItem, 'price_basis' | 'sale_basis'>, cls: Pick<WeightClass, 'sale_price' | 'purchase_price'> | null, weight: number, sales: boolean): { quantity: number; unit_price: number } {
  const price = cls ? Number(sales ? cls.sale_price : cls.purchase_price) || 0 : 0;
  return basisOf(item, sales) === 'per_piece' ? { quantity: 1, unit_price: price } : { quantity: Number(weight) || 0, unit_price: price };
}

/** Pieces that are on an invoice (not void) are gone; quotations and bills don't take pieces away. */
export function soldPieceIds(docs: { doc_type: string; status: string; lines: { piece_id?: number | null }[] }[], exceptDocId?: number): Set<number> {
  const out = new Set<number>();
  for (const d of docs) {
    if (d.doc_type !== 'invoice' || d.status === 'void' || (d as any).id === exceptDocId) continue;
    for (const l of d.lines) if (l.piece_id) out.add(l.piece_id);
  }
  return out;
}

/** The loose amount in the small unit ("250 g") as item units (0.25 kg), and back. */
export const fromLoose = (amount: number, factor: number) => Math.round(((Number(amount) || 0) / (Number(factor) || 1)) * 1e6) / 1e6;
export const toLoose = (qty: number, factor: number) => Math.round((Number(qty) || 0) * (Number(factor) || 1) * 1e4) / 1e4;
/** A special selling price of one item for one customer (migration 027). */
export interface CustomerPrice { id?: number; item_id: number; contact_id: number; price: number }

/** The price to quote a customer: their own price for the item if there is one, otherwise the normal selling price. */
export function priceFor(item: Pick<CatalogItem, 'id' | 'sale_price'>, contactId: number | null | undefined, prices: CustomerPrice[]): number {
  const own = contactId ? prices.find(p => p.item_id === item.id && p.contact_id === contactId) : undefined;
  return Number(own ? own.price : item.sale_price) || 0;
}

/**
 * What a document line says on the printed quotation / invoice: the item's name followed by what was typed in
 * Description, on one line — e.g. "Sales and Customer Service support (June 2026)". Lines without an item, and
 * older lines whose description already starts with the name, print as typed.
 */
export function lineText(line: { item_id?: number | null; description?: string | null }, items: Pick<CatalogItem, 'id' | 'name'>[]): string {
  const typed = (line.description || '').trim();
  const it = line.item_id ? items.find(i => i.id === line.item_id) : undefined;
  if (!it) return typed;
  if (!typed) return it.name;
  return typed.toLowerCase().startsWith(it.name.toLowerCase()) ? typed : `${it.name} ${typed}`;
}

export interface StockAdjustment { id: number; item_id: number; adj_date: string; quantity: number; reason: string | null }
export interface StockMove { date: string; ref: string; kind: 'opening' | 'sold' | 'bought' | 'returned' | 'adjusted'; quantity: number; note?: string }

const r4 = (n: number) => Math.round((Number(n) || 0) * 10000) / 10000;

/**
 * Stock movements of one item: opening stock, minus what was invoiced, plus what came in on
 * bills / expenses, plus manual adjustments. Drafts, quotations and void documents don't count.
 */
export function stockMoves(item: CatalogItem,
  docs: { id: number; doc_type: string; status: string; number: string; issue_date: string; lines: { item_id?: number | null; quantity: number; piece_id?: number | null }[] }[],
  adjustments: StockAdjustment[], pieces: Piece[] = []): StockMove[] {
  const moves: StockMove[] = [];
  if (item.stock_mode === 'pieces') {
    // counted in pieces: one in for each piece bought, one out for each piece invoiced
    const byId = new Map(pieces.filter(p => p.item_id === item.id).map(p => [p.id, p]));
    const numberOf = new Map(docs.map(d => [d.id, d]));
    for (const p of byId.values()) {
      const d = p.document_id ? numberOf.get(p.document_id) : undefined;
      if (d && (['draft', 'void'].includes(d.status))) continue;
      moves.push({ date: d?.issue_date || p.received_date, ref: d?.number || 'Received', kind: 'bought', quantity: 1, note: `${kgText(p.weight)} kg` });
    }
    for (const d of docs) {
      if (d.doc_type !== 'invoice' || d.status === 'void') continue;
      for (const l of d.lines) {
        const p = l.piece_id ? byId.get(l.piece_id) : undefined;
        if (p) moves.push({ date: d.issue_date, ref: d.number, kind: 'sold', quantity: -1, note: `${kgText(p.weight)} kg` });
      }
    }
    return moves.sort((a, b) => a.date.localeCompare(b.date));
  }
  if (Number(item.opening_qty)) moves.push({ date: '', ref: 'Opening stock', kind: 'opening', quantity: r4(item.opening_qty) });
  for (const d of docs) {
    if (['draft', 'void'].includes(d.status) || d.doc_type === 'quote') continue;
    const q = d.lines.filter(l => l.item_id === item.id).reduce((s, l) => s + (Number(l.quantity) || 0), 0);
    if (!q) continue;
    if (d.doc_type === 'invoice') moves.push({ date: d.issue_date, ref: d.number, kind: 'sold', quantity: r4(-q) });
    else if (d.doc_type === 'credit_note') moves.push({ date: d.issue_date, ref: d.number, kind: 'returned', quantity: r4(q) });
    else if (d.doc_type === 'bill' || d.doc_type === 'expense') moves.push({ date: d.issue_date, ref: d.number, kind: 'bought', quantity: r4(q) });
  }
  for (const a of adjustments.filter(x => x.item_id === item.id)) {
    moves.push({ date: a.adj_date, ref: 'Adjustment', kind: 'adjusted', quantity: r4(a.quantity), note: a.reason || undefined });
  }
  return moves.sort((a, b) => a.date.localeCompare(b.date));
}

export const onHand = (moves: StockMove[]) => r4(moves.reduce((s, m) => s + m.quantity, 0));

/** The pieces of an item still in stock: not on an invoice (void invoices free them again). */
export function piecesInStock(itemId: number, pieces: Piece[], docs: { id?: number; doc_type: string; status: string; lines: { piece_id?: number | null }[] }[]): Piece[] {
  const sold = soldPieceIds(docs as any);
  return pieces.filter(p => p.item_id === itemId && !sold.has(p.id)
    // a piece on a draft / void bill hasn't arrived yet
    && !(p.document_id && docs.some(d => (d as any).id === p.document_id && ['draft', 'void'].includes(d.status))));
}

/** What a set of pieces cost: class price x weight, or the class price as it stands. */
export function piecesCost(item: Pick<CatalogItem, 'price_basis'>, pieces: Piece[], classes: WeightClass[]): number {
  return Math.round(pieces.reduce((s, p) => {
    const c = classes.find(x => x.id === p.class_id);
    return s + (c ? (item.price_basis === 'per_piece' ? Number(c.purchase_price) : Number(c.purchase_price) * p.weight) : 0);
  }, 0) * 100) / 100;
}

export interface CostChange { item_id: number; class_id: number | null; name: string; label: string; old: number; price: number; since?: string }

/** What one supplier charged for an item (or one weight class of it): the latest price and the one before that. */
export interface SupplierPrice {
  contact_id: number; item_id: number; class_id: number | null;
  price: number; date: string; number: string; currency: string;
  prev: { price: number; date: string; number: string } | null; bills: number;
}
interface BillLike { id: number; doc_type: string; status: string; number: string; issue_date: string; contact_id: number | null; currency?: string | null;
  lines: { item_id?: number | null; unit_price: number; piece_id?: number | null }[] }
/**
 * Everything bought from each supplier, worked out from their bills and expenses (drafts and void ones don't count):
 * per item — and per weight class for items stocked by weight — the latest price, and the last different price before it.
 */
export function supplierPrices(docs: BillLike[], items: Pick<CatalogItem, 'id' | 'stock_mode'>[], classes: WeightClass[], pieces: Piece[], companyCurrency = ''): SupplierPrice[] {
  const byKey = new Map<string, { contact_id: number; item_id: number; class_id: number | null; hist: { price: number; date: string; number: string; currency: string; id: number }[] }>();
  const ordered = docs.filter(d => ['bill', 'expense'].includes(d.doc_type) && !['draft', 'void'].includes(d.status) && d.contact_id)
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.id - b.id);
  for (const d of ordered) {
    for (const l of d.lines) {
      const price = Number(l.unit_price) || 0;
      if (!l.item_id || !(price > 0)) continue;
      const it = items.find(x => x.id === l.item_id);
      let classId: number | null = null;
      if (it?.stock_mode === 'pieces') {
        const w = pieces.find(p => p.id === l.piece_id)?.weight;
        const c = w ? classOf(classes.filter(x => x.item_id === l.item_id), w) : null;
        if (!c) continue;
        classId = c.id ?? null;
      }
      const key = `${d.contact_id}:${l.item_id}:${classId ?? 0}`;
      const e = byKey.get(key) || { contact_id: d.contact_id!, item_id: l.item_id, class_id: classId, hist: [] };
      e.hist.push({ price, date: d.issue_date, number: d.number, currency: d.currency || companyCurrency, id: d.id });
      byKey.set(key, e);
    }
  }
  return [...byKey.values()].map(e => {
    const last = e.hist[e.hist.length - 1];
    const before = [...e.hist].reverse().find(h => Math.abs(h.price - last.price) > 0.005);
    return { contact_id: e.contact_id, item_id: e.item_id, class_id: e.class_id, price: last.price, date: last.date, number: last.number, currency: last.currency,
      prev: before ? { price: before.price, date: before.date, number: before.number } : null, bills: new Set(e.hist.map(h => h.id)).size };
  });
}

/**
 * Prices on a bill that changed: against what this supplier charged last time (`priorOf`), or — for something never bought
 * from them before — against the catalog's cost (the item's buying price, or the cost of the weight class of a piece).
 * Only lines in the item's own buying currency are compared with the catalog.
 */
export function costChanges(lines: { item_id?: number | null; unit_price: number; weight?: number }[], items: CatalogItem[], classes: WeightClass[],
  docCurrency: string, companyCurrency: string, priorOf?: (itemId: number, classId: number | null) => { price: number; date: string; number: string } | undefined): CostChange[] {
  const out = new Map<string, CostChange>();
  for (const l of lines) {
    const it = l.item_id ? items.find(x => x.id === l.item_id) : undefined;
    const price = Number(l.unit_price) || 0;
    if (!it || !(price > 0)) continue;
    let cls: WeightClass | null = null;
    if (it.stock_mode === 'pieces') {
      cls = classOf(classes.filter(c => c.item_id === it.id), Number(l.weight) || 0);
      if (!cls) continue;
    }
    const prior = priorOf?.(it.id, cls?.id ?? null);
    let old: number, since: string | undefined;
    if (prior) { old = prior.price; since = `${prior.number}, ${prior.date}`; }
    else {
      if ((it.purchase_currency || it.currency || companyCurrency) !== docCurrency) continue;
      old = Number(cls ? cls.purchase_price : it.purchase_price) || 0;
    }
    if (Math.abs(old - price) < 0.005) continue;
    out.set(`${it.id}:${cls?.id ?? 0}`, { item_id: it.id, class_id: cls?.id ?? null, name: it.name, label: cls ? classLabel(cls) : '', old, price, since });
  }
  return [...out.values()];
}

/** A named price list (migration 048): customers assigned to it buy at its prices. */
export interface PriceList { id: number; company_id: number; name: string; notes: string | null; archived: boolean; kind?: 'sales' | 'purchase' }
/** One price on a list; for items stocked by weight class there is one row per class. */
export interface PriceListRow { id?: number; price_list_id: number; item_id: number; class_id: number | null; price: number }

/** The price a list gives an item (or one of its weight classes); undefined when the list says nothing about it. */
export function listPrice(rows: PriceListRow[], listId: number | null | undefined, itemId: number, classId: number | null = null): number | undefined {
  if (!listId) return undefined;
  const r = rows.find(x => x.price_list_id === listId && x.item_id === itemId && (x.class_id ?? null) === (classId ?? null));
  return r ? Number(r.price) : undefined;
}

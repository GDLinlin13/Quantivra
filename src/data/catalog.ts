// Catalog: products and services, and how much stock is on hand.

export interface CatalogItem {
  id: number; company_id: number; kind: 'product' | 'service'; code: string | null; name: string;
  description: string | null; unit: string | null; sale_price: number; purchase_price: number;
  tax_rate: number | null; income_account_id: number | null; expense_account_id: number | null;
  track_stock: boolean; opening_qty: number; reorder_level: number | null; category: string | null; archived: boolean;
}
export interface StockAdjustment { id: number; item_id: number; adj_date: string; quantity: number; reason: string | null }
export interface StockMove { date: string; ref: string; kind: 'opening' | 'sold' | 'bought' | 'returned' | 'adjusted'; quantity: number; note?: string }

const r4 = (n: number) => Math.round((Number(n) || 0) * 10000) / 10000;

/**
 * Stock movements of one item: opening stock, minus what was invoiced, plus what came in on
 * bills / expenses, plus manual adjustments. Drafts, quotations and void documents don't count.
 */
export function stockMoves(item: CatalogItem,
  docs: { id: number; doc_type: string; status: string; number: string; issue_date: string; lines: { item_id?: number | null; quantity: number }[] }[],
  adjustments: StockAdjustment[]): StockMove[] {
  const moves: StockMove[] = [];
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

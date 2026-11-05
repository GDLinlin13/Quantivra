import { describe, it, expect } from 'vitest';
import { stockMoves, onHand, type CatalogItem } from '../catalog';

const item = { id: 7, track_stock: true, opening_qty: 100 } as CatalogItem;
const doc = (o: any) => ({ id: 1, number: 'X', issue_date: '2026-11-01', lines: [], ...o });

describe('stock on hand', () => {
  it('opening + bought − sold ± adjustments; drafts, quotes and void ignored', () => {
    const moves = stockMoves(item, [
      doc({ doc_type: 'invoice', status: 'sent', number: 'INV-1', lines: [{ item_id: 7, quantity: 30 }, { item_id: 8, quantity: 99 }] }),
      doc({ doc_type: 'invoice', status: 'draft', lines: [{ item_id: 7, quantity: 50 }] }),
      doc({ doc_type: 'quote', status: 'sent', lines: [{ item_id: 7, quantity: 50 }] }),
      doc({ doc_type: 'invoice', status: 'void', lines: [{ item_id: 7, quantity: 50 }] }),
      doc({ doc_type: 'bill', status: 'approved', number: 'BILL-1', lines: [{ item_id: 7, quantity: 20 }] }),
    ], [{ id: 1, item_id: 7, adj_date: '2026-11-05', quantity: -2, reason: 'damaged' }]);
    expect(moves.map(m => m.kind)).toEqual(['opening', 'sold', 'bought', 'adjusted']);
    expect(onHand(moves)).toBe(88);
  });
});

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

describe('customer prices', () => {
  it('uses the customer’s own price, otherwise the selling price', async () => {
    const { priceFor } = await import('../catalog');
    const item = { id: 1, sale_price: 67750 };
    const prices = [{ item_id: 1, contact_id: 7, price: 70000 }, { item_id: 2, contact_id: 8, price: 5 }];
    expect(priceFor(item, 7, prices)).toBe(70000);
    expect(priceFor(item, 8, prices)).toBe(67750);
    expect(priceFor(item, null, prices)).toBe(67750);
  });
});

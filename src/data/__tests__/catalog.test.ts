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

describe('invoice line text', () => {
  it('prints the item name, then the description, on one line', async () => {
    const { lineText } = await import('../catalog');
    const items = [{ id: 1, name: 'Sales and Customer Service support' }];
    expect(lineText({ item_id: 1, description: '(June 2026)' }, items)).toBe('Sales and Customer Service support (June 2026)');
    expect(lineText({ item_id: 1, description: '' }, items)).toBe('Sales and Customer Service support');
    expect(lineText({ item_id: 1, description: 'Sales and Customer Service support' }, items)).toBe('Sales and Customer Service support');
    expect(lineText({ item_id: null, description: 'Travel' }, items)).toBe('Travel');
  });
});

describe('invoice file names', () => {
  it('fills in the pattern', async () => {
    const { formatDocFileName } = await import('../../utils/payslipFiles');
    const ctx = { type: 'Invoice', number: 'CCSG2606001', customer: 'Argos Solutions Limited', reference: '', date: '2026-06-01', company: 'CC' };
    expect(formatDocFileName(undefined, ctx)).toBe('Invoice CCSG2606001 - Argos Solutions Limited.pdf');
    expect(formatDocFileName('{customer}_{number}_{month} {year}', ctx)).toBe('Argos Solutions Limited_CCSG2606001_June 2026.pdf');
    expect(formatDocFileName('{number} - {reference} - {customer}', ctx)).toBe('CCSG2606001 - Argos Solutions Limited.pdf');
  });
});

import { classOf, classLabel, piecePrice, piecesInStock, piecesCost, fromLoose, toLoose, soldPieceIds, type WeightClass, type Piece } from '../catalog';

describe('stock by weight', () => {
  const cls: WeightClass[] = [
    { id: 1, min_kg: 2, max_kg: 2.99, sale_price: 260, purchase_price: 200 },
    { id: 2, min_kg: 3, max_kg: 3.99, sale_price: 350, purchase_price: 300 },
    { id: 3, min_kg: 10, max_kg: null, sale_price: 420, purchase_price: 380 },
  ];
  it('finds the class of a weight', () => {
    expect(classOf(cls, 2.5)?.id).toBe(1);
    expect(classOf(cls, 3)?.id).toBe(2);
    expect(classOf(cls, 2.995)?.id).toBe(1); // between two classes: the lower one
    expect(classOf(cls, 1.5)).toBeNull();
    expect(classOf(cls, 5)).toBeNull(); // above 3.99 and below 10: no class
    expect(classOf(cls, 25)?.id).toBe(3);
  });
  it('labels classes', () => {
    expect(classLabel(cls[0])).toBe('2 – 2.99 kg');
    expect(classLabel(cls[2])).toBe('10 kg and above');
  });
  it('prices per KG or per piece', () => {
    expect(piecePrice({ price_basis: 'per_kg' }, cls[0], 2.5, true)).toEqual({ quantity: 2.5, unit_price: 260 });
    expect(piecePrice({ price_basis: 'per_piece' }, cls[0], 2.5, false)).toEqual({ quantity: 1, unit_price: 200 });
    expect(piecePrice({ price_basis: 'per_kg' }, null, 2.5, true)).toEqual({ quantity: 2.5, unit_price: 0 });
  });
  it('buys per KG and sells per piece', () => {
    const mixed = { price_basis: 'per_kg', sale_basis: 'per_piece' } as const;
    expect(piecePrice(mixed, cls[0], 2.5, false)).toEqual({ quantity: 2.5, unit_price: 200 });
    expect(piecePrice(mixed, cls[0], 2.5, true)).toEqual({ quantity: 1, unit_price: 260 });
    expect(piecePrice({ price_basis: 'per_kg' }, cls[0], 2.5, true)).toEqual({ quantity: 2.5, unit_price: 260 });
  });
  it('converts loose amounts', () => {
    expect(fromLoose(250, 1000)).toBe(0.25);
    expect(toLoose(0.015, 1000)).toBe(15);
  });
  const item = { id: 7, stock_mode: 'pieces', price_basis: 'per_kg', track_stock: true, opening_qty: 0 } as any;
  const pieces: Piece[] = [
    { id: 1, item_id: 7, weight: 2.3, class_id: 1, document_id: 10, received_date: '2026-01-01', note: null },
    { id: 2, item_id: 7, weight: 2.6, class_id: 1, document_id: 10, received_date: '2026-01-01', note: null },
  ];
  const docs = [
    { id: 10, doc_type: 'bill', status: 'approved', number: 'B-1', issue_date: '2026-01-01', lines: [{ item_id: 7, quantity: 2.3, piece_id: 1 }, { item_id: 7, quantity: 2.6, piece_id: 2 }] },
    { id: 11, doc_type: 'invoice', status: 'approved', number: 'I-1', issue_date: '2026-01-05', lines: [{ item_id: 7, quantity: 2.6, piece_id: 2 }] },
  ];
  it('sells a piece once and counts pieces', () => {
    expect(soldPieceIds(docs as any).has(2)).toBe(true);
    expect(piecesInStock(7, pieces, docs as any).map(p => p.id)).toEqual([1]);
    expect(onHand(stockMoves(item, docs as any, [], pieces))).toBe(1);
    // a void invoice puts the piece back
    const voided = docs.map(d => (d.id === 11 ? { ...d, status: 'void' } : d));
    expect(piecesInStock(7, pieces, voided as any).length).toBe(2);
  });
  it('values pieces at cost', () => {
    expect(piecesCost(item, [pieces[0]], cls)).toBe(460);
    expect(piecesCost({ price_basis: 'per_piece' }, [pieces[0]], cls)).toBe(200);
  });
});

import { costChanges, supplierPrices } from '../catalog';
describe('new buying prices on a bill', () => {
  const items = [
    { id: 1, name: 'Delivery', purchase_price: 200, currency: 'MYR' },
    { id: 2, name: 'Patin', stock_mode: 'pieces', price_basis: 'per_kg', purchase_price: 0, currency: 'MYR' },
    { id: 3, name: 'Local', purchase_price: 10, currency: null },
  ] as any[];
  const classes = [{ id: 9, item_id: 2, min_kg: 2, max_kg: 2.99, sale_price: 460, purchase_price: 380 }] as any[];
  it('finds prices that differ from the catalog cost', () => {
    const c = costChanges([{ item_id: 1, unit_price: 230 }, { item_id: 2, unit_price: 390, weight: 2.61 }, { item_id: 3, unit_price: 10 }], items, classes, 'MYR', 'SGD');
    expect(c.map(x => [x.item_id, x.class_id, x.old, x.price])).toEqual([[1, null, 200, 230], [2, 9, 380, 390]]);
  });
  it('ignores the same price, a price in another currency, and a weight with no class', () => {
    expect(costChanges([{ item_id: 1, unit_price: 200 }], items, classes, 'MYR', 'SGD')).toEqual([]);
    expect(costChanges([{ item_id: 1, unit_price: 230 }], items, classes, 'USD', 'SGD')).toEqual([]);
    expect(costChanges([{ item_id: 2, unit_price: 390, weight: 1.2 }], items, classes, 'MYR', 'SGD')).toEqual([]);
  });
});

import { listPrice } from '../catalog';
describe('price lists', () => {
  const rows = [
    { price_list_id: 1, item_id: 5, class_id: null, price: 12 },
    { price_list_id: 1, item_id: 7, class_id: 9, price: 450 },
    { price_list_id: 2, item_id: 5, class_id: null, price: 10 },
  ];
  it('gives the list price of an item or of a weight class', () => {
    expect(listPrice(rows as any, 1, 5)).toBe(12);
    expect(listPrice(rows as any, 2, 5)).toBe(10);
    expect(listPrice(rows as any, 1, 7, 9)).toBe(450);
  });
  it('says nothing when the list does not cover it, or the customer has no list', () => {
    expect(listPrice(rows as any, 1, 6)).toBeUndefined();
    expect(listPrice(rows as any, 1, 7, 8)).toBeUndefined();
    expect(listPrice(rows as any, null, 5)).toBeUndefined();
  });
});

describe('supplier prices from their bills', () => {
  const items = [{ id: 1, name: 'Delivery', purchase_price: 200, currency: 'MYR', stock_mode: 'normal' }, { id: 2, name: 'Patin', stock_mode: 'pieces', price_basis: 'per_kg', purchase_price: 0, currency: 'MYR' }] as any[];
  const classes = [{ id: 9, item_id: 2, min_kg: 2, max_kg: 2.99, sale_price: 460, purchase_price: 380 }] as any[];
  const pieces = [{ id: 31, item_id: 2, weight: 2.6, class_id: 9, document_id: 12, received_date: '2026-02-01', note: null }] as any[];
  const bill = (id: number, date: string, contact: number, lines: any[], status = 'approved') => ({ id, doc_type: 'bill', status, number: `B-${id}`, issue_date: date, contact_id: contact, currency: 'MYR', lines });
  const docs = [
    bill(10, '2026-01-05', 7, [{ item_id: 1, unit_price: 200 }]),
    bill(11, '2026-01-20', 7, [{ item_id: 1, unit_price: 230 }]),
    bill(12, '2026-02-01', 7, [{ item_id: 2, unit_price: 390, piece_id: 31 }]),
    bill(13, '2026-02-10', 8, [{ item_id: 1, unit_price: 180 }]),
    bill(14, '2026-03-01', 7, [{ item_id: 1, unit_price: 999 }], 'draft'),
  ];
  const all = supplierPrices(docs as any, items, classes, pieces, 'MYR');
  it('keeps the latest price per supplier and item, and the price before it', () => {
    const a = all.find(x => x.contact_id === 7 && x.item_id === 1)!;
    expect([a.price, a.number, a.prev?.price, a.bills]).toEqual([230, 'B-11', 200, 2]);        // the draft bill does not count
    expect(all.find(x => x.contact_id === 8 && x.item_id === 1)!.price).toBe(180);               // another supplier, another price
    expect(all.find(x => x.contact_id === 8 && x.item_id === 1)!.prev).toBeNull();
  });
  it('keeps a price per weight class for items stocked by weight', () => {
    const p = all.find(x => x.item_id === 2)!;
    expect([p.contact_id, p.class_id, p.price]).toEqual([7, 9, 390]);
  });
  it('asks about a price that changed since the last time, or differs from the catalog the first time', () => {
    const prior = (i: number, c: number | null) => { const h = all.find(x => x.contact_id === 7 && x.item_id === i && (x.class_id ?? null) === c); return h ? { price: h.price, date: h.date, number: h.number } : undefined; };
    expect(costChanges([{ item_id: 1, unit_price: 230 }], items, classes, 'MYR', 'SGD', prior)).toEqual([]);                    // same as last time
    const c = costChanges([{ item_id: 1, unit_price: 250 }], items, classes, 'MYR', 'SGD', prior);
    expect([c[0].old, c[0].price, c[0].since]).toEqual([230, 250, 'B-11, 2026-01-20']);
    // never bought from this supplier: compared with the catalog cost
    expect(costChanges([{ item_id: 1, unit_price: 230 }], items, classes, 'MYR', 'SGD').map(x => [x.old, x.price])).toEqual([[200, 230]]);
    expect(costChanges([{ item_id: 2, unit_price: 400, weight: 2.6 }], items, classes, 'MYR', 'SGD', prior).map(x => [x.class_id, x.old, x.price])).toEqual([[9, 390, 400]]);
    expect(costChanges([{ item_id: 1, unit_price: 230 }], items, classes, 'USD', 'SGD')).toEqual([]);                           // another currency: no catalog comparison
  });
});

describe('weighed pieces without weight classes', () => {
  const items = [{ id: 2, name: 'Patin', stock_mode: 'pieces', price_basis: 'per_kg', purchase_price: 0, currency: 'MYR' }] as any[];
  const pieces = [{ id: 31, item_id: 2, weight: 2.6, class_id: null, document_id: 12, received_date: '2026-02-01', note: null }] as any[];
  const docs = [{ id: 12, doc_type: 'bill', status: 'approved', number: 'B-12', issue_date: '2026-02-01', contact_id: 7, currency: 'MYR', lines: [{ item_id: 2, unit_price: 115, piece_id: 31 }] }];
  it('prices per KG for every piece: one supplier price, no class', () => {
    const p = supplierPrices(docs as any, items, [], pieces, 'MYR');
    expect([p.length, p[0].class_id, p[0].price]).toEqual([1, null, 115]);
  });
  it('asks about a changed price without needing a class', () => {
    const prior = () => ({ price: 115, date: '2026-02-01', number: 'B-12' });
    expect(costChanges([{ item_id: 2, unit_price: 120, weight: 2.1 }], items, [], 'MYR', 'SGD', prior).map(c => [c.class_id, c.old, c.price])).toEqual([[null, 115, 120]]);
  });
});

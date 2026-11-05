import { describe, it, expect } from 'vitest';
import {
  blankTemplate, mergeRange, unmergeRange, coveredSet, insertRow, deleteRow, insertCol, deleteCol,
  expandTemplate, fillText, expandRange, normalizeTemplate, colName, key,
} from '../gridTemplate';
import { STARTER_LAYOUTS, sampleData } from '../../data/documentLayouts';

describe('grid layouts', () => {
  it('names columns like Excel', () => {
    expect([0, 25, 26, 27, 51, 52].map(colName)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA']);
  });

  it('merges keep the top-left cell and hide the rest', () => {
    let t = blankTemplate(4, 4);
    t = { ...t, cells: { [key(0, 0)]: { v: 'keep', b: true }, [key(1, 1)]: { v: 'gone' } } };
    t = mergeRange(t, { r1: 0, c1: 0, r2: 1, c2: 2 });
    expect(t.cells[key(0, 0)]).toEqual({ v: 'keep', b: true, rs: 2, cs: 3 });
    expect(t.cells[key(1, 1)]).toBeUndefined();
    expect(coveredSet(t).size).toBe(5);
    expect(expandRange(t, { r1: 1, c1: 2, r2: 1, c2: 3 })).toEqual({ r1: 0, c1: 0, r2: 1, c2: 3 });
    t = unmergeRange(t, { r1: 1, c1: 1, r2: 1, c2: 1 });
    expect(t.cells[key(0, 0)]).toEqual({ v: 'keep', b: true });
  });

  it('inserting and deleting rows/columns moves cells and stretches merges', () => {
    let t = blankTemplate(5, 3);
    t = { ...t, cells: { [key(0, 0)]: { v: 'm', rs: 3 }, [key(4, 1)]: { v: 'x' } } };
    t = insertRow(t, 1);
    expect(t.rows.length).toBe(6);
    expect(t.cells[key(0, 0)].rs).toBe(4);
    expect(t.cells[key(5, 1)].v).toBe('x');
    t = deleteRow(t, 0); // remove the merge's top row: it moves down a row
    expect(t.cells[key(0, 0)]).toEqual({ v: 'm', rs: 3 });
    expect(t.cells[key(4, 1)].v).toBe('x');
    t = insertCol(t, 0);
    expect(t.cells[key(4, 2)].v).toBe('x');
    t = deleteCol(t, 2);
    expect(t.cells[key(4, 2)]).toBeUndefined();
    expect(t.cols.length).toBe(3);
  });

  it('fills fields and line fields', () => {
    expect(fillText('Hi {{ employee_name }} – {{line.amount}} {{unknown}}', { employee_name: 'Ann' }, { amount: '5' })).toBe('Hi Ann – 5 ');
  });

  it('repeating rows print once per item, and merges across them stretch', () => {
    let t = blankTemplate(3, 2);
    t = {
      ...t,
      rows: [{}, { repeat: 'earnings' }, {}],
      cells: { [key(0, 1)]: { v: 'side', rs: 3 }, [key(1, 0)]: { v: '{{line.name}}' }, [key(2, 0)]: { v: 'end' } },
    };
    const out = expandTemplate(t, {}, { earnings: [{ name: 'Basic' }, { name: 'Bonus' }, { name: 'OT' }] });
    expect(out.length).toBe(5);
    expect(out.map(r => r.cells[0].text)).toEqual(['', 'Basic', 'Bonus', 'OT', 'end']);
    expect(out[0].cells[1].rowSpan).toBe(5);
    expect(out[1].cells.length).toBe(1); // the merged side cell is not repeated
    const none = expandTemplate(t, {}, { earnings: [] });
    expect(none.length).toBe(2);
    expect(none[0].cells[1].rowSpan).toBe(2);
  });

  it('starter layouts fill in cleanly with example data', () => {
    for (const kind of ['payslip', 'invoice'] as const) {
      const t = STARTER_LAYOUTS[kind]();
      const { fields, lists } = sampleData(kind, { name: 'Cosmos', currency: 'SGD' }, null);
      const text = expandTemplate(t, fields, lists).flatMap(r => r.cells.map(c => c.text)).join('|');
      expect(text).not.toMatch(/\{\{/);
      expect(text).toContain(kind === 'payslip' ? 'Basic Salary' : 'Consulting services');
    }
  });

  it('falls back when the stored layout is missing or broken', () => {
    const fb = blankTemplate(1, 1);
    expect(normalizeTemplate(null, fb)).toBe(fb);
    expect(normalizeTemplate({ cols: 'x' }, fb)).toBe(fb);
    expect(normalizeTemplate({ enabled: 1, cols: [5, 'a'], rows: [{ h: 30, repeat: 'lines' }], cells: {} }, fb))
      .toEqual({ enabled: true, cols: [20, 100], rows: [{ h: 30, repeat: 'lines' }], cells: {} });
  });
});

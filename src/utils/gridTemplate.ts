// Spreadsheet-style document layouts (payslip, invoice). The company lays out
// a grid like an Excel sheet, typing text and {{fields}} into cells; at print
// time the fields are filled in. A row can be marked as "repeating" so it is
// printed once per earning / deduction / invoice line.

export type Align = 'left' | 'center' | 'right';

export interface GridCell {
  v?: string;          // text, may contain {{field}} placeholders
  b?: boolean;         // bold
  i?: boolean;         // italic
  u?: boolean;         // underline
  al?: Align;
  va?: 'top' | 'middle' | 'bottom';
  fs?: number;         // font size (px)
  c?: string;          // text colour
  bg?: string;         // fill colour
  bt?: boolean; br?: boolean; bb?: boolean; bl?: boolean; // borders
  cs?: number;         // merged columns (on the top-left cell)
  rs?: number;         // merged rows (on the top-left cell)
}

export interface GridRow {
  h?: number;          // height (px)
  repeat?: string;     // list name: printed once per item in that list
}

export interface GridTemplate {
  enabled: boolean;
  cols: number[];      // column widths (px)
  rows: GridRow[];
  cells: Record<string, GridCell>; // key "row:col"
}

export const key = (r: number, c: number) => `${r}:${c}`;

export function colName(c: number): string {
  let s = '';
  let n = c + 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export function blankTemplate(rows = 20, cols = 6): GridTemplate {
  return { enabled: false, cols: Array(cols).fill(Math.round(680 / cols)), rows: Array.from({ length: rows }, () => ({})), cells: {} };
}

/** Keep only sane values (the template is stored as JSON and could be old or hand-edited). */
export function normalizeTemplate(t: any, fallback: GridTemplate): GridTemplate {
  if (!t || !Array.isArray(t.cols) || !Array.isArray(t.rows) || typeof t.cells !== 'object' || !t.cells) return fallback;
  return {
    enabled: !!t.enabled,
    cols: t.cols.map((w: any) => Math.max(20, Math.min(800, Number(w) || 100))),
    rows: t.rows.map((r: any) => ({ ...(r?.h ? { h: Number(r.h) } : {}), ...(r?.repeat ? { repeat: String(r.repeat) } : {}) })),
    cells: t.cells,
  };
}

// ---- merges ---------------------------------------------------------------

export interface Merge { r: number; c: number; rs: number; cs: number }

export function merges(t: GridTemplate): Merge[] {
  const out: Merge[] = [];
  for (const [k, cell] of Object.entries(t.cells)) {
    if ((cell.rs || 1) > 1 || (cell.cs || 1) > 1) {
      const [r, c] = k.split(':').map(Number);
      out.push({ r, c, rs: cell.rs || 1, cs: cell.cs || 1 });
    }
  }
  return out;
}

/** The merge whose top-left cell is (r,c), or the merge that covers (r,c). */
export function mergeAt(t: GridTemplate, r: number, c: number): Merge | null {
  for (const m of merges(t)) {
    if (r >= m.r && r < m.r + m.rs && c >= m.c && c < m.c + m.cs) return m;
  }
  return null;
}

/** Cells hidden underneath a merge (not the top-left one). */
export function coveredSet(t: GridTemplate): Set<string> {
  const s = new Set<string>();
  for (const m of merges(t)) {
    for (let r = m.r; r < m.r + m.rs; r++) for (let c = m.c; c < m.c + m.cs; c++) if (r !== m.r || c !== m.c) s.add(key(r, c));
  }
  return s;
}

export interface Range { r1: number; c1: number; r2: number; c2: number }

export function normRange(a: { r: number; c: number }, b: { r: number; c: number }): Range {
  return { r1: Math.min(a.r, b.r), c1: Math.min(a.c, b.c), r2: Math.max(a.r, b.r), c2: Math.max(a.c, b.c) };
}

/** Grow a range until no merge sticks out of it (Excel does the same). */
export function expandRange(t: GridTemplate, rg: Range): Range {
  let { r1, c1, r2, c2 } = rg;
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of merges(t)) {
      const overlaps = m.r <= r2 && m.r + m.rs - 1 >= r1 && m.c <= c2 && m.c + m.cs - 1 >= c1;
      if (!overlaps) continue;
      if (m.r < r1) { r1 = m.r; changed = true; }
      if (m.c < c1) { c1 = m.c; changed = true; }
      if (m.r + m.rs - 1 > r2) { r2 = m.r + m.rs - 1; changed = true; }
      if (m.c + m.cs - 1 > c2) { c2 = m.c + m.cs - 1; changed = true; }
    }
  }
  return { r1, c1, r2, c2 };
}

export function mergeRange(t: GridTemplate, rg: Range): GridTemplate {
  const r = expandRange(t, rg);
  if (r.r1 === r.r2 && r.c1 === r.c2) return t;
  const cells = { ...t.cells };
  const topLeft = { ...(cells[key(r.r1, r.c1)] || {}) };
  for (let i = r.r1; i <= r.r2; i++) for (let j = r.c1; j <= r.c2; j++) delete cells[key(i, j)];
  cells[key(r.r1, r.c1)] = { ...topLeft, rs: r.r2 - r.r1 + 1, cs: r.c2 - r.c1 + 1 };
  return { ...t, cells };
}

export function unmergeRange(t: GridTemplate, rg: Range): GridTemplate {
  const cells = { ...t.cells };
  for (const m of merges(t)) {
    const overlaps = m.r <= rg.r2 && m.r + m.rs - 1 >= rg.r1 && m.c <= rg.c2 && m.c + m.cs - 1 >= rg.c1;
    if (overlaps) { const { rs: _rs, cs: _cs, ...rest } = cells[key(m.r, m.c)]; cells[key(m.r, m.c)] = rest; }
  }
  return { ...t, cells };
}

// ---- inserting / deleting rows and columns ---------------------------------

function remap(t: GridTemplate, f: (r: number, c: number, cell: GridCell) => { r: number; c: number; cell: GridCell } | null): Record<string, GridCell> {
  const out: Record<string, GridCell> = {};
  for (const [k, cell] of Object.entries(t.cells)) {
    const [r, c] = k.split(':').map(Number);
    const res = f(r, c, cell);
    if (res) out[key(res.r, res.c)] = res.cell;
  }
  return out;
}

export function insertRow(t: GridTemplate, at: number): GridTemplate {
  const rows = [...t.rows];
  rows.splice(at, 0, {});
  const cells = remap(t, (r, c, cell) => {
    if (r >= at) return { r: r + 1, c, cell };
    // a merge that runs across the insert point grows by one row
    if ((cell.rs || 1) > 1 && r + (cell.rs || 1) > at) return { r, c, cell: { ...cell, rs: (cell.rs || 1) + 1 } };
    return { r, c, cell };
  });
  return { ...t, rows, cells };
}

export function deleteRow(t: GridTemplate, at: number): GridTemplate {
  if (t.rows.length <= 1) return t;
  const rows = t.rows.filter((_, i) => i !== at);
  const cells = remap(t, (r, c, cell) => {
    const rs = cell.rs || 1;
    if (r === at) {
      // the top row of a merge is removed: the rest of the merge moves up into its place
      if (rs > 1) return { r, c, cell: { ...cell, rs: rs - 1 } };
      return null;
    }
    if (r > at) return { r: r - 1, c, cell };
    if (rs > 1 && r + rs > at) return { r, c, cell: { ...cell, rs: rs - 1 } };
    return { r, c, cell };
  });
  return { ...t, rows, cells };
}

export function insertCol(t: GridTemplate, at: number): GridTemplate {
  const cols = [...t.cols];
  cols.splice(at, 0, 100);
  const cells = remap(t, (r, c, cell) => {
    if (c >= at) return { r, c: c + 1, cell };
    if ((cell.cs || 1) > 1 && c + (cell.cs || 1) > at) return { r, c, cell: { ...cell, cs: (cell.cs || 1) + 1 } };
    return { r, c, cell };
  });
  return { ...t, cols, cells };
}

export function deleteCol(t: GridTemplate, at: number): GridTemplate {
  if (t.cols.length <= 1) return t;
  const cols = t.cols.filter((_, i) => i !== at);
  const cells = remap(t, (r, c, cell) => {
    const cs = cell.cs || 1;
    if (c === at) {
      if (cs > 1) return { r, c, cell: { ...cell, cs: cs - 1 } };
      return null;
    }
    if (c > at) return { r, c: c - 1, cell };
    if (cs > 1 && c + cs > at) return { r, c, cell: { ...cell, cs: cs - 1 } };
    return { r, c, cell };
  });
  return { ...t, cols, cells };
}

/** Apply a change to every cell in a range (creating empty cells as needed). */
export function styleRange(t: GridTemplate, rg: Range, patch: Partial<GridCell> | ((cell: GridCell, r: number, c: number) => GridCell)): GridTemplate {
  const cells = { ...t.cells };
  const covered = coveredSet(t);
  for (let r = rg.r1; r <= rg.r2; r++) for (let c = rg.c1; c <= rg.c2; c++) {
    if (covered.has(key(r, c))) continue;
    const cur = cells[key(r, c)] || {};
    cells[key(r, c)] = typeof patch === 'function' ? patch(cur, r, c) : { ...cur, ...patch };
  }
  return { ...t, cells };
}

/** Borders on the outside edge of a range (each cell gets the edge it sits on). */
export function outlineRange(t: GridTemplate, rg: Range, on: boolean): GridTemplate {
  return styleRange(t, rg, (cell, r, c) => {
    const span = { rs: cell.rs || 1, cs: cell.cs || 1 };
    const next = { ...cell };
    if (r === rg.r1) next.bt = on;
    if (r + span.rs - 1 >= rg.r2) next.bb = on;
    if (c === rg.c1) next.bl = on;
    if (c + span.cs - 1 >= rg.c2) next.br = on;
    return next;
  });
}

// ---- filling in -----------------------------------------------------------

export type FieldValues = Record<string, string>;
export type ListValues = Record<string, FieldValues[]>;

const FIELD_RE = /\{\{\s*([a-z0-9_.]+)\s*\}\}/gi;

export function fillText(text: string, fields: FieldValues, line?: FieldValues): string {
  return text.replace(FIELD_RE, (_m, name: string) => {
    const k = name.toLowerCase();
    if (k.startsWith('line.')) return line?.[k.slice(5)] ?? '';
    return fields[k] ?? '';
  });
}

export function isLogoCell(v?: string) {
  return !!v && /^\s*\{\{\s*logo\s*\}\}\s*$/i.test(v);
}

export interface OutCell { r: number; c: number; cell: GridCell; text: string; rowSpan: number; colSpan: number }
export interface OutRow { h?: number; cells: OutCell[] }

/**
 * Expand the template into the rows that will be printed: repeating rows are
 * printed once per list item (or not at all when the list is empty), and
 * merges that run across a repeating row stretch to match.
 */
export function expandTemplate(t: GridTemplate, fields: FieldValues, lists: ListValues): OutRow[] {
  // merges may not start inside a repeating row; ignore any that do
  const safe: GridTemplate = { ...t, cells: Object.fromEntries(Object.entries(t.cells).map(([k, cell]) => {
    const r = Number(k.split(':')[0]);
    if (t.rows[r]?.repeat && (cell.rs || 1) > 1) return [k, { ...cell, rs: 1 }];
    return [k, cell];
  })) };
  const covered = coveredSet(safe);
  const counts = t.rows.map(row => (row.repeat ? (lists[row.repeat] || []).length : 1));
  const out: OutRow[] = [];
  t.rows.forEach((row, r) => {
    const items: (FieldValues | undefined)[] = row.repeat ? (lists[row.repeat] || []) : [undefined];
    for (const item of items) {
      const cells: OutCell[] = [];
      for (let c = 0; c < t.cols.length; c++) {
        if (covered.has(key(r, c))) continue;
        const cell = safe.cells[key(r, c)] || {};
        const rs = cell.rs || 1;
        let rowSpan = 0;
        for (let i = r; i < Math.min(r + rs, t.rows.length); i++) rowSpan += i === r ? 1 : counts[i];
        cells.push({ r, c, cell, text: fillText(cell.v || '', fields, item), rowSpan: Math.max(1, rowSpan), colSpan: cell.cs || 1 });
      }
      out.push({ h: row.h, cells });
    }
  });
  return out;
}

// ---- copy / paste / move -----------------------------------------------------

export interface Block { h: number; w: number; cells: Record<string, GridCell> } // keys "dr:dc"

export function copyBlock(t: GridTemplate, rg: Range): Block {
  const r = expandRange(t, rg);
  const cells: Record<string, GridCell> = {};
  for (let i = r.r1; i <= r.r2; i++) for (let j = r.c1; j <= r.c2; j++) {
    const cell = t.cells[key(i, j)];
    if (cell) cells[key(i - r.r1, j - r.c1)] = { ...cell };
  }
  return { h: r.r2 - r.r1 + 1, w: r.c2 - r.c1 + 1, cells };
}

/** Empty an area: its cells are removed and any merge poking into it is undone. */
export function clearArea(t: GridTemplate, rg: Range): GridTemplate {
  let next = unmergeRange(t, rg);
  const cells = { ...next.cells };
  for (let i = rg.r1; i <= rg.r2; i++) for (let j = rg.c1; j <= rg.c2; j++) delete cells[key(i, j)];
  next = { ...next, cells };
  return next;
}

/** Put a copied block with its top-left at (r,c), adding rows/columns if it runs off the sheet. */
export function pasteBlock(t: GridTemplate, b: Block, at: { r: number; c: number }): GridTemplate {
  let next = t;
  while (next.rows.length < at.r + b.h) next = { ...next, rows: [...next.rows, {}] };
  while (next.cols.length < at.c + b.w) next = { ...next, cols: [...next.cols, 100] };
  next = clearArea(next, { r1: at.r, c1: at.c, r2: at.r + b.h - 1, c2: at.c + b.w - 1 });
  const cells = { ...next.cells };
  for (const [k, cell] of Object.entries(b.cells)) {
    const [dr, dc] = k.split(':').map(Number);
    cells[key(at.r + dr, at.c + dc)] = { ...cell };
  }
  return { ...next, cells };
}

/** Drag-and-drop: move a range of cells (text, formatting and merges) to a new top-left position. */
export function moveRange(t: GridTemplate, rg: Range, to: { r: number; c: number }): GridTemplate {
  const r = expandRange(t, rg);
  if (r.r1 === to.r && r.c1 === to.c) return t;
  const b = copyBlock(t, r);
  return pasteBlock(clearArea(t, r), b, to);
}

// Documents: one place for the company's files, sorted into folders automatically.
// Payslips and invoices / quotations / credit notes are made from the records when opened;
// attachments, bank statements and other uploads are stored files.

export type DocFile =
  | { key: string; name: string; date: string; kind: 'payslip'; slipId: number; runId: number }
  | { key: string; name: string; date: string; kind: 'doc'; docId: number; docType: string }
  | { key: string; name: string; date: string; kind: 'stored'; path: string; size: number | null; fileId?: number; attachmentId?: number };

export interface Folder {
  key: string; title: string; children: Folder[]; files: DocFile[];
  /** files can be uploaded here */
  upload?: 'other';
  /** your own folder inside Other files, e.g. 'Contracts/Leases' ('' = Other files itself) */
  userPath?: string;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthTitle = (m: number) => `${String(m).padStart(2, '0')} ${MONTHS[m - 1] || ''}`;

export interface DocumentsInput {
  runs: { id: number; period_year: number; period_month: number; status: string; pay_date?: string }[];
  /** payslips of finalised runs, with the file name to show */
  slips?: { id: number; run_id: number; employee_name: string; name: string }[];
  docs: { id: number; doc_type: string; number: string | null; issue_date: string; status: string; contact?: string }[];
  attachments: { id: number; document_id: number; file_name: string; path: string; size_bytes: number | null; created_at?: string }[];
  files: { id: number; folder: string; account_id: number | null; period: string | null; path: string; file_name: string; size_bytes: number | null; created_at: string; subfolder?: string | null }[];
  /** folders the company made inside Other files, e.g. ['Contracts', 'Contracts/Leases'] */
  userFolders?: string[];
  banks: { id: number; name: string }[];
}

type Item = { ym: string; who?: string; file: DocFile };

/** Put items into year → month folders (by date) or one folder per person / company (by name). */
function fill(top: Folder, items: Item[], by: 'date' | 'name') {
  const sortFiles = (f: Folder) => f.files.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  if (by === 'name') {
    const groups = new Map<string, Folder>();
    for (const it of items) {
      const who = it.who || 'Others';
      let g = groups.get(who);
      if (!g) { g = { key: `${top.key}/@${who}`, title: who, children: [], files: [] }; groups.set(who, g); }
      g.files.push(it.file);
    }
    top.children = [...groups.values()].sort((a, b) => a.title.localeCompare(b.title));
    top.children.forEach(sortFiles);
    return;
  }
  const years = new Map<string, Folder>();
  for (const it of items) {
    const [y, m] = it.ym.split('-');
    let yf = years.get(y);
    if (!yf) { yf = { key: `${top.key}/${y}`, title: y, children: [], files: [] }; years.set(y, yf); }
    const mk = `${yf.key}/${m}`;
    let mf = yf.children.find(c => c.key === mk);
    if (!mf) { mf = { key: mk, title: monthTitle(Number(m)), children: [], files: [] }; yf.children.push(mf); }
    mf.files.push(it.file);
  }
  top.children = [...years.values()].sort((a, b) => b.title.localeCompare(a.title));
  for (const y of top.children) {
    y.children.sort((a, b) => b.key.localeCompare(a.key));
    y.children.forEach(sortFiles);
  }
}

const SALES: Record<string, string> = { invoice: 'Invoices', quote: 'Quotations', credit_note: 'Credit notes' };

export function buildFolders(input: DocumentsInput, opts: { payslips?: boolean; by?: 'date' | 'name' } = {}): Folder[] {
  const by = opts.by || 'date';
  const out: Folder[] = [];
  const docById = new Map(input.docs.map(d => [d.id, d]));
  const label = (d: DocumentsInput['docs'][number]) => `${d.number || 'Draft'}${d.contact ? ` - ${d.contact}` : ''}`;

  if (opts.payslips !== false) {
    const f: Folder = { key: 'payslips', title: 'Payslips', children: [], files: [] };
    const runs = new Map(input.runs.filter(r => r.status !== 'draft').map(r => [r.id, r]));
    fill(f, (input.slips || []).flatMap(p => {
      const r = runs.get(p.run_id);
      if (!r) return [];
      const ym = `${r.period_year}-${String(r.period_month).padStart(2, '0')}`;
      return [{ ym, who: p.employee_name, file: { key: `slip-${p.id}`, name: p.name, date: r.pay_date || `${ym}-01`, kind: 'payslip' as const, slipId: p.id, runId: r.id } }];
    }), by);
    out.push(f);
  }
  for (const [type, title] of Object.entries(SALES)) {
    const docs = input.docs.filter(d => d.doc_type === type && d.status !== 'draft');
    if (!docs.length && type === 'credit_note') continue;
    const f: Folder = { key: type, title, children: [], files: [] };
    const items: Item[] = docs.map(d => ({
      ym: d.issue_date.slice(0, 7), who: d.contact,
      file: { key: `doc-${d.id}`, name: `${label(d)}.pdf`, date: d.issue_date, kind: 'doc', docId: d.id, docType: d.doc_type },
    }));
    // files attached to these documents sit next to them
    for (const a of input.attachments) {
      const d = docById.get(a.document_id);
      if (d && d.doc_type === type) items.push({ ym: d.issue_date.slice(0, 7), who: d.contact, file: { key: `att-${a.id}`, name: `${d.number || 'Draft'} - ${a.file_name}`, date: d.issue_date, kind: 'stored', path: a.path, size: a.size_bytes, attachmentId: a.id } });
    }
    fill(f, items, by);
    out.push(f);
  }
  {
    const f: Folder = { key: 'bills', title: 'Bills & expenses', children: [], files: [] };
    fill(f, input.attachments.flatMap(a => {
      const d = docById.get(a.document_id);
      if (!d || (d.doc_type !== 'bill' && d.doc_type !== 'expense')) return [];
      return [{ ym: d.issue_date.slice(0, 7), who: d.contact, file: { key: `att-${a.id}`, name: `${label(d)} - ${a.file_name}`, date: d.issue_date, kind: 'stored' as const, path: a.path, size: a.size_bytes, attachmentId: a.id } }];
    }), by);
    out.push(f);
  }
  {
    const f: Folder = { key: 'bank', title: 'Bank statements', children: [], files: [] };
    const banks = new Map<string, Folder>();
    // every bank gets a folder, so a statement can be uploaded into it
    for (const b of input.banks) banks.set(b.name, { key: `bank/${b.id}`, title: b.name, children: [], files: [] });
    for (const x of input.files.filter(x => x.folder === 'bank')) {
      const name = input.banks.find(b => b.id === x.account_id)?.name || 'Other bank';
      let bf = banks.get(name);
      if (!bf) { bf = { key: `bank/${x.account_id ?? 'other'}`, title: name, children: [], files: [] }; banks.set(name, bf); }
      const y = (x.period || x.created_at).slice(0, 4);
      let yf = bf.children.find(c => c.title === y);
      if (!yf) { yf = { key: `${bf.key}/${y}`, title: y, children: [], files: [] }; bf.children.push(yf); }
      yf.files.push({ key: `file-${x.id}`, name: x.file_name, date: x.period || x.created_at.slice(0, 10), kind: 'stored', path: x.path, size: x.size_bytes, fileId: x.id });
    }
    f.children = [...banks.values()].sort((a, b) => a.title.localeCompare(b.title));
    for (const b of f.children) {
      b.children.sort((a, c) => c.title.localeCompare(a.title));
      for (const y of b.children) y.files.sort((a, c) => c.date.localeCompare(a.date));
    }
    out.push(f);
  }
  {
    // supporting documents of things booked from the bank (share capital, loans, bank charges…), by month
    const f: Folder = { key: 'support', title: 'Supporting documents', children: [], files: [] };
    fill(f, input.files.filter(x => x.folder === 'journal').map(x => {
      const ym = (x.period || x.created_at).slice(0, 7);
      return { ym, file: { key: `file-${x.id}`, name: x.file_name, date: x.period || x.created_at.slice(0, 10), kind: 'stored' as const, path: x.path, size: x.size_bytes, fileId: x.id } };
    }), 'date');
    if (f.children.length) out.push(f);
  }
  {
    // the company's own folders (folders inside folders too) sit at the top level with the others;
    // files not put in a folder are under Other files
    const root: Folder = { key: 'other', title: 'Other files', children: [], files: [], upload: 'other', userPath: '' };
    const tops: Folder[] = [];
    const byPath = new Map<string, Folder>();
    const ensure = (path: string): Folder => {
      if (!path) return root;
      const hit = byPath.get(path);
      if (hit) return hit;
      const parts = path.split('/');
      const f: Folder = { key: `other/${path}`, title: parts[parts.length - 1], children: [], files: [], upload: 'other', userPath: path };
      if (parts.length === 1) tops.push(f); else ensure(parts.slice(0, -1).join('/')).children.push(f);
      byPath.set(path, f);
      return f;
    };
    const clean = (p?: string | null) => (p || '').split('/').map(x => x.trim()).filter(Boolean).join('/');
    for (const p of input.userFolders || []) if (clean(p)) ensure(clean(p));
    for (const x of input.files.filter(x => x.folder === 'other')) {
      ensure(clean(x.subfolder)).files.push({ key: `file-${x.id}`, name: x.file_name, date: x.created_at.slice(0, 10), kind: 'stored' as const, path: x.path, size: x.size_bytes, fileId: x.id });
    }
    // own folders and their files: by name, numbers in number order (202605, 202606 … / 2, 10)
    const byName = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
    const sortAll = (f: Folder) => { f.children.sort((a, b) => byName(a.title, b.title)); f.files.sort((a, b) => byName(a.name, b.name)); f.children.forEach(sortAll); };
    tops.sort((a, b) => byName(a.title, b.title)).forEach(sortAll);
    sortAll(root);
    out.push(...tops, root);
  }
  return out;
}

/** The month a bank statement covers: the month most of its lines fall in. */
/** The month a statement is for, from its own text (e.g. "Statement Date: 31 Jul 2025" → 2025-07); null if none. */
export function statementMonthFromText(text: string): string | null {
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const named = text.match(/\b(\d{1,2})[\s\-/.]+([A-Za-z]{3,9})[\s\-/.,]+(20\d{2})\b/);
  if (named) { const m = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase()); if (m >= 0) return `${named[3]}-${String(m + 1).padStart(2, '0')}`; }
  const iso = text.match(/\b(20\d{2})-(\d{2})-\d{2}\b/);
  if (iso) return `${iso[1]}-${iso[2]}`;
  const dmy = text.match(/\b\d{1,2}\/(\d{1,2})\/(20\d{2})\b/);
  return dmy ? `${dmy[2]}-${dmy[1].padStart(2, '0')}` : null;
}

export function statementPeriod(dates: string[]): string | null {
  const count = new Map<string, number>();
  for (const d of dates) { const m = d.slice(0, 7); count.set(m, (count.get(m) || 0) + 1); }
  return [...count.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? null;
}

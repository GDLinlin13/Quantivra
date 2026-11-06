// Importing a statement into a bank account that already has lines keyed in by hand, or entries recorded in
// Quantivra (e.g. the other side of a transfer). Each statement line takes over a keyed-in line with the same
// date and amount (keeping its match), or is matched to a recorded entry of the same amount within a few days;
// everything is then stored in the statement's own order.

export interface PlanLine { txn_date: string; description: string; amount: number }
export interface ExistingLine { id: number; txn_date: string; amount: number; description: string | null; status: string }
export interface RecordedEntry { id: number; txn_date: string; amount: number; journal_id: number | null; payment_id: number | null }

export type PlannedLine<L extends PlanLine> =
  | { line: L; kind: 'new' }
  | { line: L; kind: 'keyed'; existing: ExistingLine }
  | { line: L; kind: 'recorded'; recorded: RecordedEntry };

const sameMoney = (a: number, b: number) => Math.abs(Number(a) - Number(b)) < 0.005;
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

export function planImport<L extends PlanLine>(lines: L[], existing: ExistingLine[], recorded: RecordedEntry[] = []): PlannedLine<L>[] {
  const usedE = new Set<number>(), usedR = new Set<number>();
  const byId = [...existing].sort((a, b) => a.id - b.id);
  return lines.map(line => {
    const e = byId.find(x => !usedE.has(x.id) && x.txn_date === line.txn_date && sameMoney(x.amount, line.amount));
    if (e) { usedE.add(e.id); return { line, kind: 'keyed' as const, existing: e }; }
    const hits = recorded.filter(r => !usedR.has(r.id) && sameMoney(r.amount, line.amount) && daysApart(r.txn_date, line.txn_date) <= 3)
      .sort((a, b) => daysApart(a.txn_date, line.txn_date) - daysApart(b.txn_date, line.txn_date));
    if (hits[0]) { usedR.add(hits[0].id); return { line, kind: 'recorded' as const, recorded: hits[0] }; }
    return { line, kind: 'new' as const };
  });
}

/** True when the file only repeats lines already there, word for word (nothing to import). */
export const nothingNew = (plan: PlannedLine<PlanLine>[]) =>
  plan.every(p => p.kind === 'keyed' && (p.existing.description || '') === p.line.description);

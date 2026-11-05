import { useState, useMemo } from 'react';
import { Modal, Select, Typography, Alert, Space, Tag, Button, Empty } from 'antd';
import { learnLayout, parseWithLayout, ROLE_LABEL, type PdfRow, type PieceRole, type PdfLayout, type PdfBankLine } from '../../../../data/bankPdf';

const { Text } = Typography;
const AMOUNTISH = /^\(?-?(?:S\$|\$)?[\d,]+\.\d{2}\)?(?:\s?(?:CR|DR))?$/i;

/** A first guess at what a piece of a row is. */
function guess(s: string, isHeader: boolean): PieceRole {
  const t = s.toLowerCase();
  if (isHeader) {
    if (/date/.test(t)) return 'date';
    if (/withdraw|debit|money out|paid out/.test(t)) return 'out';
    if (/deposit|credit|money in|paid in/.test(t)) return 'in';
    if (/balance/.test(t)) return 'balance';
    if (/amount/.test(t)) return 'amount';
    if (/desc|particular|detail|transaction|narrative|reference|remark/.test(t)) return 'description';
    return 'ignore';
  }
  if (/^\d{1,2}[\s/.-]([a-z]{3}|\d{1,2})([\s/.-]\d{2,4})?$|^\d{4}-\d{2}-\d{2}$/i.test(s)) return 'date';
  if (AMOUNTISH.test(s)) return 'ignore';
  return 'description';
}

/**
 * Teach Quantivra how a bank's PDF statement is laid out: click the column-heading row and/or a
 * transaction row, say what each piece is, and every row of the statement is read the same way.
 */
export function TeachPdf({ rows, bankName, onClose, onDone }: {
  rows: PdfRow[]; bankName: string; onClose: () => void;
  onDone: (layout: PdfLayout, lines: PdfBankLine[]) => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);
  const [roles, setRoles] = useState<Record<string, PieceRole>>({});
  const roleOf = (ri: number, pi: number) => roles[`${ri}:${pi}`] ?? guess(rows[ri][pi].s, /date/i.test(rows[ri].map(p => p.s).join(' ')) && !AMOUNTISH.test(rows[ri][pi].s) && rows[ri].every(p => !AMOUNTISH.test(p.s)));

  const layout: PdfLayout = useMemo(() => {
    const cols = picked.flatMap(ri => learnLayout(rows[ri], rows[ri].map((_, pi) => roleOf(ri, pi))).columns);
    return { columns: cols };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, roles, rows]);
  const result = useMemo(() => parseWithLayout(rows, layout), [rows, layout]);
  const hasDate = layout.columns.some(c => c.role === 'date');
  const hasMoney = layout.columns.some(c => ['out', 'in', 'amount'].includes(c.role));

  const toggle = (ri: number) => setPicked(p => (p.includes(ri) ? p.filter(x => x !== ri) : [...p, ri].slice(-3)));
  return (
    <Modal open width={980} onCancel={onClose} title={`Teach Quantivra how to read ${bankName} statements`}
      okText={`Use this — ${result.lines.length} transactions found`} okButtonProps={{ disabled: !hasDate || !hasMoney || !result.lines.length }}
      onOk={() => onDone(layout, result.lines)}>
      <Alert type="info" showIcon style={{ marginBottom: 12 }}
        title="1. Click the row with the column headings (Date, Description, Withdrawal, Deposit, Balance…). You can also click a transaction row. 2. Check what each piece is. Quantivra remembers this for this bank account."
      />
      <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, fontFamily: 'monospace', fontSize: 12 }}>
        {rows.slice(0, 200).map((r, ri) => (
          <div key={ri} onClick={() => toggle(ri)}
            style={{ padding: '3px 8px', cursor: 'pointer', whiteSpace: 'nowrap', background: picked.includes(ri) ? 'rgba(22,119,255,0.25)' : undefined, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            {r.map(p => p.s).join('   ')}
          </div>
        ))}
      </div>
      {picked.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Click a row above" style={{ margin: '12px 0' }} /> : picked.map(ri => (
        <div key={ri} style={{ marginTop: 12 }}>
          <Text type="secondary">Row: {rows[ri].map(p => p.s).join('  ·  ')}</Text>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
            {rows[ri].map((p, pi) => (
              <div key={pi} style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: 6, minWidth: 150 }}>
                <div style={{ fontSize: 12, marginBottom: 4, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.s}</div>
                <Select size="small" style={{ width: '100%' }} value={roleOf(ri, pi)}
                  onChange={v => setRoles(r => ({ ...r, [`${ri}:${pi}`]: v }))}
                  options={(Object.keys(ROLE_LABEL) as PieceRole[]).map(k => ({ value: k, label: ROLE_LABEL[k] }))} />
              </div>
            ))}
          </div>
        </div>
      ))}
      {picked.length > 0 && (
        <Space style={{ marginTop: 12 }} wrap>
          {!hasDate && <Tag color="red">Mark which piece is the Date</Tag>}
          {!hasMoney && <Tag color="red">Mark Money out / Money in (or Amount)</Tag>}
          {hasDate && hasMoney && <Text>{result.lines.length} transactions found{result.unsure ? ` (${result.unsure} to check)` : ''}.</Text>}
          {picked.length > 0 && <Button size="small" onClick={() => { setPicked([]); setRoles({}); }}>Start over</Button>}
        </Space>
      )}
    </Modal>
  );
}

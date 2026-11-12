import { useState, useEffect, useRef } from 'react';
import { Modal, Checkbox, Radio, Space, Button, Progress, Typography, message, Alert } from 'antd';
import { PrinterOutlined, DownloadOutlined } from '@ant-design/icons';
import type { PayrollRunRow, PayslipRow } from '../../../../services/payroll';
import type { Branding } from '../../../../services/branding';
import { hrService, type Employee } from '../../../../services/hr';
import { PayslipView, PRINT_CSS } from './PayslipView';
import {
  formatFileName, uniqueNames, elementsToPdf, zipFiles, downloadBlob, DEFAULT_COMBINED_FILE_NAME, type FileNameContext,
} from '../../../../utils/payslipFiles';

const { Text } = Typography;

/** Print or download many payslips at once: one document, or one PDF per employee in a zip. */
export function BulkPayslips({ open, onClose, run, slips, company, branding }: {
  open: boolean; onClose: () => void; run: PayrollRunRow; slips: PayslipRow[]; company: any; branding: Branding | null;
}) {
  const [selected, setSelected] = useState<number[]>(() => slips.map(s => s.id));
  const [mode, setMode] = useState<'combined' | 'separate'>('combined');
  const [employees, setEmployees] = useState<Map<number, Employee> | null>(null);
  const [busy, setBusy] = useState<null | { done: number; total: number }>(null);
  const area = useRef<HTMLDivElement>(null);
  const t = branding?.templates.payslip;

  useEffect(() => { if (open) setSelected(slips.map(s => s.id)); }, [open, slips]);
  useEffect(() => {
    if (!open || !company?.id) return;
    hrService.listEmployees(company.id)
      .then(list => setEmployees(new Map(list.map(e => [Number(e.id), e]))))
      .catch(() => setEmployees(new Map()));
  }, [open, company?.id]);

  const chosen = slips.filter(s => selected.includes(s.id));
  const ctxFor = (s: PayslipRow): FileNameContext => {
    const e = employees?.get(Number(s.employee_id));
    return {
      name: s.employee_name, id: s.employee_code || '', designation: (s.result_json?.designation ?? e?.job_title) || '',
      year: run.period_year, month: run.period_month, company: branding?.legal_name || company?.name || '',
    };
  };
  const combinedName = formatFileName(t?.combinedFileName, { year: run.period_year, month: run.period_month, company: branding?.legal_name || company?.name || '' }, DEFAULT_COMBINED_FILE_NAME);
  const nodes = () => chosen.map(s => area.current?.querySelector<HTMLElement>(`[data-slip="${s.id}"]`)).filter(Boolean) as HTMLElement[];

  const print = () => {
    const els = nodes();
    if (!els.length) return;
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) { message.error('Allow pop-ups to print'); return; }
    w.document.write(`<html><head><title>${combinedName.replace(/\.pdf$/, '')}</title><style>${PRINT_CSS}</style></head><body>${
      els.map(el => `<div class="qv-page">${el.innerHTML}</div>`).join('')}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const download = async () => {
    const els = nodes();
    if (!els.length) return;
    try {
      if (mode === 'combined') {
        setBusy({ done: 0, total: 1 });
        downloadBlob(await elementsToPdf(els), combinedName);
      } else {
        setBusy({ done: 0, total: els.length });
        const names = uniqueNames(chosen.map(s => formatFileName(t?.fileName, ctxFor(s))));
        const files: { name: string; blob: Blob }[] = [];
        for (let i = 0; i < els.length; i++) {
          files.push({ name: names[i], blob: await elementsToPdf([els[i]]) });
          setBusy({ done: i + 1, total: els.length });
        }
        if (files.length === 1) downloadBlob(files[0].blob, files[0].name);
        else downloadBlob(await zipFiles(files), combinedName.replace(/\.pdf$/, '.zip'));
      }
      message.success('Download ready');
    } catch (e: any) {
      message.error(`Could not create the PDF: ${e.message}`);
    }
    setBusy(null);
  };

  const ready = !!employees;
  const sample = chosen[0] || slips[0];
  return (
    <Modal open={open} onCancel={onClose} width={640} title="Print / download payslips"
      footer={
        <Space>
          <Button onClick={onClose}>Close</Button>
          <Button icon={<PrinterOutlined />} disabled={!ready || !chosen.length || !!busy} onClick={print}>Print</Button>
          <Button type="primary" icon={<DownloadOutlined />} disabled={!ready || !chosen.length} loading={!!busy} onClick={download}>
            Download {mode === 'separate' && chosen.length > 1 ? `${chosen.length} PDFs (.zip)` : 'PDF'}
          </Button>
        </Space>
      }>
      <div style={{ marginBottom: 12 }}>
        <Checkbox
          checked={chosen.length === slips.length} indeterminate={chosen.length > 0 && chosen.length < slips.length}
          onChange={e => setSelected(e.target.checked ? slips.map(s => s.id) : [])}>
          <b>All employees</b> ({chosen.length} of {slips.length} selected)
        </Checkbox>
        <div style={{ maxHeight: 200, overflowY: 'auto', marginTop: 6, paddingLeft: 24 }}>
          <Checkbox.Group value={selected} onChange={v => setSelected(v as number[])} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {slips.map(s => <Checkbox key={s.id} value={s.id}>{s.employee_name} <Text type="secondary">{s.employee_code}</Text></Checkbox>)}
          </Checkbox.Group>
        </div>
      </div>

      <div style={{ marginBottom: 8, fontWeight: 600 }}>Download as</div>
      <Radio.Group value={mode} onChange={e => setMode(e.target.value)} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Radio value="combined">One document — one payslip per page</Radio>
        <Radio value="separate">A separate PDF for each employee {chosen.length > 1 && <Text type="secondary">(downloaded together in one .zip file)</Text>}</Radio>
      </Radio.Group>

      <Alert type="info" showIcon style={{ marginTop: 12 }} title={
        mode === 'combined' || chosen.length <= 1
          ? <>File name: <b>{mode === 'combined' ? combinedName : sample ? formatFileName(t?.fileName, ctxFor(sample)) : ''}</b></>
          : <>File names like: <b>{sample ? formatFileName(t?.fileName, ctxFor(sample)) : ''}</b> inside <b>{combinedName.replace(/\.pdf$/, '.zip')}</b></>
      } description={<span style={{ fontSize: 12 }}>Change the file name format in Document Templates → Payslip Template. “Print” always prints one document, one payslip per page.</span>} />

      {busy && busy.total > 1 && <Progress style={{ marginTop: 12 }} percent={Math.round((busy.done / busy.total) * 100)} format={() => `${busy.done} / ${busy.total}`} />}
      {!ready && <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>Preparing payslips…</Text>}

      {/* The payslips are drawn off-screen at A4 width, then printed or turned into PDFs. */}
      <div ref={area} aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 760, pointerEvents: 'none' }}>
        {ready && chosen.map(s => (
          <div key={s.id} data-slip={s.id} style={{ width: 760, background: '#fff' }}>
            <PayslipView slip={s} company={company} branding={branding} period={run}
              employee={employees!.get(Number(s.employee_id)) ?? null} domId={`payslip-${s.id}`} />
          </div>
        ))}
      </div>
    </Modal>
  );
}

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Modal, Spin, Button, Empty, Tabs, Table, Typography, message } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import { downloadBlob } from '../utils/payslipFiles';

const { Text } = Typography;
type Rows = (string | number | boolean | Date | null)[][];

const ext = (name: string) => (name.split('.').pop() || '').toLowerCase();
/** Which files can be shown in the viewer (the rest can be downloaded). */
export const canView = (name: string) => ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'docx', 'xlsx', 'xlsm', 'csv', 'txt'].includes(ext(name));

function parseCsv(text: string): Rows {
  const rows: Rows = [];
  let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function Sheet({ rows }: { rows: Rows }) {
  const width = Math.max(0, ...rows.map(r => r.length));
  const show = (v: unknown) => (v instanceof Date ? v.toISOString().slice(0, 10) : v == null ? '' : String(v));
  return (
    <Table size="small" bordered pagination={false} scroll={{ x: 'max-content', y: '65vh' }} rowKey={(_, i) => String(i)}
      dataSource={rows.map(r => ({ r }))}
      columns={Array.from({ length: width }, (_, c) => ({
        title: String.fromCharCode(65 + (c % 26)) + (c >= 26 ? String(Math.floor(c / 26)) : ''), key: String(c),
        render: (_: unknown, x: { r: Rows[number] }) => <span style={{ whiteSpace: 'pre-wrap' }}>{show(x.r[c])}</span>,
      }))} />
  );
}

/**
 * Show a file in a popup: PDFs and pictures as they are, Word (.docx) and Excel (.xlsx, .csv) drawn here in the
 * browser (the file never leaves Quantivra). Other kinds can be downloaded.
 */
export function FileViewer({ name, load, onClose }: { name: string; load: () => Promise<Blob>; onClose: () => void }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [sheets, setSheets] = useState<{ sheet: string; data: Rows }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const docx = useRef<HTMLDivElement>(null);
  const kind = ext(name);

  useEffect(() => {
    let live = true, made: string | null = null;
    (async () => {
      try {
        const b = await load();
        if (!live) return;
        setBlob(b);
        if (['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(kind)) {
          // PDFs need their type to show in the browser's viewer
          made = URL.createObjectURL(kind === 'pdf' ? new Blob([b], { type: 'application/pdf' }) : b);
          setUrl(made);
        } else if (kind === 'xlsx' || kind === 'xlsm') {
          const { default: readXlsxFile } = await import('read-excel-file/browser');
          const all = await readXlsxFile(b);
          if (live) setSheets(all.map(s => ({ sheet: s.sheet, data: s.data as Rows })));
        } else if (kind === 'csv' || kind === 'txt') {
          const text = await b.text();
          if (live) setSheets([{ sheet: name, data: kind === 'csv' ? parseCsv(text) : text.split(/\r?\n/).map(l => [l]) }]);
        }
      } catch (e: any) { if (live) setError(e.message || 'Could not open the file'); }
    })();
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  // Word: drawn into the box once the file is here
  useEffect(() => {
    if (kind !== 'docx' || !blob || !docx.current) return;
    import('docx-preview').then(({ renderAsync }) => renderAsync(blob, docx.current!, undefined, { inWrapper: true, ignoreLastRenderedPageBreak: true }))
      .catch(e => setError(e.message || 'Could not show this Word file'));
  }, [blob, kind]);

  let body: ReactNode;
  if (error) body = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={error} />;
  else if (!blob) body = <div style={{ textAlign: 'center', padding: 48 }}><Spin /></div>;
  else if (kind === 'pdf' && url) body = <iframe title={name} src={url} style={{ width: '100%', height: '75vh', border: 0, background: '#fff' }} />;
  else if (url) body = <div style={{ textAlign: 'center' }}><img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: '75vh' }} /></div>;
  else if (kind === 'docx') body = <div ref={docx} style={{ maxHeight: '75vh', overflow: 'auto', background: '#f5f5f5' }} />;
  else if (sheets) {
    body = sheets.length === 1 ? <Sheet rows={sheets[0].data} />
      : <Tabs items={sheets.map(s => ({ key: s.sheet, label: s.sheet, children: <Sheet rows={s.data} /> }))} />;
  } else {
    body = <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<Text>This kind of file can't be shown here. Download it to open it.</Text>} />;
  }

  return (
    <Modal open onCancel={onClose} width="min(1100px, 96vw)" title={name} footer={
      <Button icon={<DownloadOutlined />} disabled={!blob} onClick={() => { if (blob) downloadBlob(blob, name); else message.info('Still loading'); }}>Download</Button>
    } styles={{ body: { padding: 0 } }}>
      {body}
    </Modal>
  );
}

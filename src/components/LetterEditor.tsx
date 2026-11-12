import { useEffect, useRef, useState } from 'react';
import { Modal, Input, Button, Select, Space, Tooltip, Typography, message } from 'antd';
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined, UnorderedListOutlined, OrderedListOutlined, AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined,
  UndoOutlined, RedoOutlined, ClearOutlined,
} from '@ant-design/icons';
import { DocumentShell } from './DocumentShell';
import { GridDocument } from './GridDocument';
import { companyFields } from '../data/documentLayouts';
import { companyRegLabel } from '../data/countries';
import { splitAtBody } from '../utils/gridTemplate';
import { buildDocx } from '../utils/docxExport';
import { elementToPagedPdf } from '../utils/payslipFiles';
import { companyFileService, documentFolderService, type CompanyFile } from '../services/finance';
import { fmtDate } from '../utils/dateFormat';
import type { Branding } from '../services/branding';

const { Text } = Typography;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** A logo saved as a data URI, as bytes for the Word file (PNG and JPEG only). */
function dataUriBytes(uri?: string | null): { bytes: Uint8Array; ext: 'png' | 'jpeg' } | null {
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(uri || '');
  if (!m) return null;
  return { bytes: Uint8Array.from(atob(m[2]), c => c.charCodeAt(0)), ext: m[1].toLowerCase() === 'png' ? 'png' : 'jpeg' };
}
/** A drawn part of the page as a PNG (a custom letterhead goes into the Word file as a picture). */
async function elementToPng(el: HTMLElement): Promise<{ bytes: Uint8Array; w: number; h: number }> {
  const { default: html2canvas } = await import('html2canvas');
  const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
  const blob: Blob = await new Promise((res, rej) => canvas.toBlob(b => (b ? res(b) : rej(new Error('Could not draw the letterhead'))), 'image/png'));
  return { bytes: new Uint8Array(await blob.arrayBuffer()), w: canvas.width, h: canvas.height };
}

const STYLE = `
.qv-letter { outline: none; min-height: 440px; font-size: 14px; line-height: 1.55; color: #111; padding: 4px 0; }
.qv-letter h1 { font-size: 24px; margin: 14px 0 8px; } .qv-letter h2 { font-size: 19px; margin: 12px 0 6px; } .qv-letter h3 { font-size: 16px; margin: 10px 0 4px; }
.qv-letter ul { list-style: disc; padding-left: 28px; margin: 6px 0; } .qv-letter ol { list-style: decimal; padding-left: 28px; margin: 6px 0; }
.qv-letter p, .qv-letter div { margin: 0; }
`;

/**
 * A Word-like page on the company letterhead: type the text, then save it into Documents as a Word file (.docx, which can be
 * opened here again) and a PDF, in the folder and under the name you choose.
 */
export function LetterEditor({ companyId, company, branding, initial, onClose, onSaved }: {
  companyId: number; company: any; branding: Branding;
  /** an earlier document to change: its text, name, folder and the files it replaces when saved */
  initial?: { title: string; html: string; subfolder?: string | null; replace?: CompanyFile[] };
  onClose: () => void; onSaved: () => void;
}) {
  const lh = branding.templates.letterhead;
  const [title, setTitle] = useState(initial?.title || '');
  const [fileName, setFileName] = useState(initial?.title || '');
  const [nameTouched, setNameTouched] = useState(!!initial);
  const [folder, setFolder] = useState(initial?.subfolder || '');
  const [folders, setFolders] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const editor = useRef<HTMLDivElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const foot = useRef<HTMLDivElement>(null);
  useEffect(() => { documentFolderService.list(companyId).then(setFolders).catch(() => setFolders([])); }, [companyId]);

  const dateText = fmtDate(new Date().toISOString().slice(0, 10));
  const footerText = (lh.footerNote || '').trim() || (branding.footer_note || '').trim();
  const shownTitle = title.trim() || 'Document';
  const fields = { ...companyFields(company, branding, lh.footerNote), document_title: shownTitle, document_date: dateText };
  const custom = lh.layout?.enabled ? splitAtBody(lh.layout) : null;

  const cmd = (name: string, value?: string) => { editor.current?.focus(); document.execCommand(name, false, value); };
  const tool = (label: string, icon: React.ReactNode, name: string, value?: string) => (
    <Tooltip title={label}><Button size="small" icon={icon} onMouseDown={e => e.preventDefault()} onClick={() => cmd(name, value)} /></Tooltip>
  );

  const save = async () => {
    const name = (fileName.trim() || title.trim()).replace(/[\\/:*?"<>|]+/g, ' ').trim();
    if (!title.trim()) { message.error('Give the document a name'); return; }
    if (!name) { message.error('Give the file a name'); return; }
    const html = editor.current?.innerHTML || '';
    if (!(editor.current?.innerText || '').trim()) { message.error('Type something in the document first'); return; }
    setSaving(true);
    try {
      const pdf = await elementToPagedPdf(page.current!);
      const headerImage = custom && head.current ? await elementToPng(head.current) : null;
      const footerImage = custom && foot.current ? await elementToPng(foot.current) : null;
      const lines = lh.showCompanyBlock ? [
        branding.registration_no ? `${companyRegLabel(company?.country)} ${branding.registration_no}` : '',
        branding.address || '',
        [branding.phone, branding.email, branding.website].filter(Boolean).join('  ·  '),
      ].filter(Boolean) : [];
      const docx = await buildDocx({
        title: title.trim(), html, date: dateText,
        letterhead: {
          name: branding.legal_name || company?.name || '', lines, accent: branding.accent_color || '#1677ff', footer: footerText,
          logo: lh.showLogo ? dataUriBytes(branding.logo_data_uri) : null, headerImage, footerImage,
        },
      });
      const where = { folder: 'other' as const, subfolder: folder || null };
      await companyFileService.add(companyId, new File([docx], `${name}.docx`, { type: DOCX_MIME }), where);
      await companyFileService.add(companyId, new File([pdf], `${name}.pdf`, { type: 'application/pdf' }), where);
      // changing an earlier document replaces its files
      for (const old of initial?.replace || []) await companyFileService.remove(old).catch(() => null);
      message.success(`Saved in Documents: ${name}.docx and ${name}.pdf`);
      onSaved();
    } catch (e: any) { message.error(e.message); }
    setSaving(false);
  };

  return (
    <Modal open onCancel={onClose} footer={null} width={960} style={{ top: 12 }} destroyOnHidden title={initial ? 'Edit document' : 'New document'}>
      <style>{STYLE}</style>
      <Space orientation="vertical" size={10} style={{ width: '100%' }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input style={{ width: 360 }} placeholder="Document name, e.g. Letter of Employment" value={title}
            onChange={e => { setTitle(e.target.value); if (!nameTouched) setFileName(e.target.value); }} />
          <Space size={4} wrap>
            {tool('Bold (Ctrl+B)', <BoldOutlined />, 'bold')}
            {tool('Italic (Ctrl+I)', <ItalicOutlined />, 'italic')}
            {tool('Underline (Ctrl+U)', <UnderlineOutlined />, 'underline')}
            <Select size="small" style={{ width: 130 }} defaultValue="P" onChange={v => cmd('formatBlock', v)}
              options={[{ value: 'P', label: 'Normal text' }, { value: 'H1', label: 'Heading 1' }, { value: 'H2', label: 'Heading 2' }, { value: 'H3', label: 'Heading 3' }]} />
            {tool('Bullet list', <UnorderedListOutlined />, 'insertUnorderedList')}
            {tool('Numbered list', <OrderedListOutlined />, 'insertOrderedList')}
            {tool('Align left', <AlignLeftOutlined />, 'justifyLeft')}
            {tool('Centre', <AlignCenterOutlined />, 'justifyCenter')}
            {tool('Align right', <AlignRightOutlined />, 'justifyRight')}
            {tool('Undo', <UndoOutlined />, 'undo')}
            {tool('Redo', <RedoOutlined />, 'redo')}
            {tool('Clear formatting', <ClearOutlined />, 'removeFormat')}
          </Space>
        </div>

        <div style={{ maxHeight: '60vh', overflow: 'auto', background: '#3a3f45', padding: 16, borderRadius: 6 }}>
          <div ref={page} style={{ background: '#fff', color: '#111', borderRadius: 2, padding: 28, width: 794, maxWidth: '100%', margin: '0 auto', minHeight: 600 }}>
            {custom ? (
              <>
                <div ref={head}><GridDocument template={custom.header} fields={fields} lists={{}} logo={branding.logo_data_uri} /></div>
                <EditorBody editorRef={editor} html={initial?.html} />
                {custom.footer && <div ref={foot}><GridDocument template={custom.footer} fields={fields} lists={{}} logo={branding.logo_data_uri} /></div>}
              </>
            ) : (
              <DocumentShell country={company?.country} branding={branding} companyName={company?.name || ''} title={shownTitle} meta={dateText} forPrint
                showLogo={lh.showLogo} showCompanyBlock={lh.showCompanyBlock} footerNote={footerText}>
                <EditorBody editorRef={editor} html={initial?.html} />
              </DocumentShell>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <div>
            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>Save in</Text>
            <Select style={{ width: 280 }} value={folder} onChange={setFolder}
              options={[{ value: '', label: 'Documents → Other files' }, ...folders.map(f => ({ value: f, label: `Documents → Other files → ${f.split('/').join(' → ')}` }))]} />
          </div>
          <div>
            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>File name</Text>
            <Input style={{ width: 280 }} value={fileName} onChange={e => { setFileName(e.target.value); setNameTouched(true); }} />
          </div>
          <Button type="primary" loading={saving} onClick={save}>Save as Word and PDF</Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </Space>
    </Modal>
  );
}

/** The typing area. Its text is set once, so typing never fights the page around it. */
function EditorBody({ editorRef, html }: { editorRef: React.RefObject<HTMLDivElement | null>; html?: string }) {
  return (
    <div ref={el => {
      (editorRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      if (el && !el.dataset.ready) { el.dataset.ready = '1'; el.innerHTML = html || '<div><br></div>'; }
    }} className="qv-letter" contentEditable suppressContentEditableWarning spellCheck
      onPaste={e => { e.preventDefault(); document.execCommand('insertText', false, e.clipboardData.getData('text/plain')); }} />
  );
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import { renderPdf } from '../../../utils/renderPdf';
import { Typography, Tree, Table, Button, Space, Upload, Empty, Spin, message, Popconfirm, Alert, Breadcrumb, DatePicker, Select, Modal, Input } from 'antd';
import dayjs from 'dayjs';
import { FolderOutlined, FolderOpenOutlined, FilePdfOutlined, FileOutlined, DownloadOutlined, EyeOutlined, UploadOutlined, DeleteOutlined, FolderAddOutlined } from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { brandingService, type Branding } from '../../../services/branding';
import { payrollService, type PayrollRunRow, type PayslipRow } from '../../../services/payroll';
import { hrService, type Employee } from '../../../services/hr';
import {
  docService, contactService, accountService, financeSettingsService, catalogService, attachmentService, companyFileService, statementPrefService, documentFolderService,
  type Attachment, type CompanyFile, type DuplicateStatement,
} from '../../../services/finance';
import { DEFAULT_FINANCE_SETTINGS, DOC_LABEL, type FinDocument, type FinanceSettings, type Contact, type ContactPerson } from '../../../data/finance';
import { lineText, type CatalogItem } from '../../../data/catalog';
import { buildFolders, type Folder, type DocFile } from '../../../data/documents';
import { downloadBlob, formatFileName, formatDocFileName } from '../../../utils/payslipFiles';
import { PayslipView } from './hr/PayslipView';
import { DocumentView } from './finance/DocumentView';
import { saveBankStatement } from './finance/saveStatement';

const { Title, Text } = Typography;

type Row = DocFile;

/** Documents: payslips, invoices, bills' files, bank statements and other files, in folders. */
export function CompanyDocumentsPage() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [company, setCompany] = useState<any>(null);
  const [branding, setBranding] = useState<Branding | null>(null);
  const [settings, setSettings] = useState<FinanceSettings>(DEFAULT_FINANCE_SETTINGS);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [people, setPeople] = useState<ContactPerson[]>([]);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [docs, setDocs] = useState<FinDocument[]>([]);
  const [runs, setRuns] = useState<PayrollRunRow[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [files, setFiles] = useState<CompanyFile[]>([]);
  const [banks, setBanks] = useState<{ id: number; name: string }[]>([]);
  const [employees, setEmployees] = useState<Map<number, Employee>>(new Map());
  const [selected, setSelected] = useState<string>('payslips');
  const [slips, setSlips] = useState<PayslipRow[]>([]);
  // folders by date (year / month) or by name (employee, customer, supplier)
  const [by, setBy] = useState<'date' | 'name'>(() => { try { return localStorage.getItem('qv-docs-by') === 'name' ? 'name' : 'date'; } catch { return 'date'; } });
  const changeBy = (v: 'date' | 'name') => { setBy(v); setSelected(trail[0]?.key || 'payslips'); try { localStorage.setItem('qv-docs-by', v); } catch { /* ignore */ } };
  const [busy, setBusy] = useState<string | null>(null);
  const [month, setMonth] = useState(dayjs().subtract(1, 'month'));
  const [expanded, setExpanded] = useState<string[]>([]);
  const [dupPref, setDupPref] = useState<DuplicateStatement>('ask');
  // the company's own folders inside Other files
  const [userFolders, setUserFolders] = useState<string[]>([]);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolder, setNewFolder] = useState('');
  const [folderParent, setFolderParent] = useState('');
  useEffect(() => { if (companyId) statementPrefService.get(companyId).then(setDupPref).catch(() => null); }, [companyId]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    const safe = <T,>(p: Promise<T>, d: T) => p.catch(() => d);
    const [co, b, s, cs, pp, it, ds, rs, at, fs, acc, emps, uf] = await Promise.all([
      supabase.from('companies').select('*').eq('id', companyId).maybeSingle().then(r => r.data),
      safe(brandingService.get(companyId), null as Branding | null),
      safe(financeSettingsService.get(companyId), DEFAULT_FINANCE_SETTINGS),
      safe(contactService.list(companyId), [] as Contact[]),
      safe(contactService.peopleOf(companyId), [] as ContactPerson[]),
      safe(catalogService.list(companyId), [] as CatalogItem[]),
      safe(docService.list(companyId, ['quote', 'invoice', 'credit_note', 'bill', 'expense']), [] as FinDocument[]),
      safe(payrollService.listRuns(companyId), [] as PayrollRunRow[]),
      safe(attachmentService.listAll(companyId), [] as Attachment[]),
      safe(companyFileService.list(companyId), [] as CompanyFile[]),
      safe(accountService.list(companyId), []),
      safe(hrService.listEmployees(companyId), [] as Employee[]),
      safe(documentFolderService.list(companyId), [] as string[]),
    ]);
    setCompany(co); setBranding(b); setSettings(s); setContacts(cs); setPeople(pp); setItems(it); setDocs(ds); setRuns(rs);
    setAttachments(at); setFiles(fs); setBanks(acc.filter(a => a.subtype === 'bank').map(a => ({ id: a.id, name: a.name })));
    setEmployees(new Map(emps.map(e => [Number(e.id), e]))); setUserFolders(uf);
    // every payslip of the finalised runs (pay data: empty without pay access)
    const done = rs.filter(r => r.status !== 'draft').map(r => r.id);
    setSlips(done.length ? await supabase.from('payslips').select('*').in('run_id', done).then(r => (r.error ? [] : r.data || [])) : []);
    setLoading(false);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  const coName = branding?.legal_name || company?.name || '';
  const runById = useMemo(() => new Map(runs.map(r => [r.id, r])), [runs]);
  const slipName = (p: PayslipRow) => {
    const r = runById.get(p.run_id)!;
    return formatFileName(branding?.templates.payslip.fileName, {
      name: p.employee_name, id: p.employee_code || '', designation: p.result_json?.designation || employees.get(Number(p.employee_id))?.job_title || '',
      year: r.period_year, month: r.period_month, company: coName,
    });
  };
  const folders = useMemo(() => buildFolders({
    runs, attachments, files, banks, userFolders,
    slips: slips.filter(p => runById.has(p.run_id)).map(p => ({ id: p.id, run_id: p.run_id, employee_name: p.employee_name, name: slipName(p) })),
    docs: docs.map(d => ({ ...d, contact: contacts.find(c => c.id === d.contact_id)?.name })),
  }, { by }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [runs, slips, docs, attachments, files, banks, contacts, by, branding, employees, userFolders]);

  // find the selected folder and the path to it
  const trail = useMemo(() => {
    const walk = (list: Folder[], path: Folder[]): Folder[] | null => {
      for (const f of list) {
        if (f.key === selected) return [...path, f];
        const hit = walk(f.children, [...path, f]);
        if (hit) return hit;
      }
      return null;
    };
    return walk(folders, []) || [folders[0]];
  }, [folders, selected]);
  const folder = trail[trail.length - 1];
  // inside Bank statements → <bank>: statements can be uploaded for a chosen month
  const bankId = trail[0]?.key === 'bank' && trail[1] ? Number(trail[1].key.split('/')[1]) || null : null;

  const rows: Row[] = folder?.files || [];

  /** The file's contents and the name to save it under. */
  const fileOf = async (r: Row): Promise<{ blob: Blob; name: string }> => {
    if (r.kind === 'payslip') {
      const slip = slips.find(p => p.id === r.slipId)!, run = runById.get(r.runId)!;
      return { name: r.name, blob: await renderPdf(<PayslipView slip={slip} company={company} branding={branding} period={run} employee={employees.get(Number(slip.employee_id)) || null} domId="doc-render" />) };
    }
    if (r.kind === 'doc') {
      const { doc, lines } = await docService.get(r.docId);
      const contact = contacts.find(c => c.id === doc.contact_id) || null;
      const person = people.find(p => p.id === doc.contact_person_id) || null;
      const name = formatDocFileName(branding?.templates.invoice.fileName, {
        type: DOC_LABEL[doc.doc_type], number: doc.number, customer: contact?.name, reference: doc.reference, date: doc.issue_date, company: coName,
      });
      return { name, blob: await renderPdf(<DocumentView doc={doc} lines={lines.map(l => ({ ...l, description: lineText(l, items) }))} contact={contact} person={person} company={company} branding={branding} settings={settings} domId="doc-render" />) };
    }
    return { name: r.name, blob: await companyFileService.blob(r.path) };
  };
  const act = async (r: Row, how: 'open' | 'download') => {
    // open the tab straight away so the browser doesn't block it
    const w = how === 'open' ? window.open('', '_blank') : null;
    setBusy(r.key);
    try {
      const { blob, name } = await fileOf(r);
      if (w) w.location.href = URL.createObjectURL(blob);
      else downloadBlob(blob, name);
    } catch (e: any) { w?.close(); message.error(e.message); }
    setBusy(null);
  };

  if (!companyId) return null;
  if (loading) return <Spin />;
  const toTree = (list: Folder[]): any[] => list.map(f => ({ key: f.key, title: f.title, children: toTree(f.children), isLeaf: !f.children.length }));
  return (
    <div>
      <Space style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }} wrap>
        <Title level={4} style={{ color: '#f0ede6', margin: 0 }}>Documents</Title>
        <Space>
        <Button icon={<FolderAddOutlined />} onClick={() => { setFolderParent(''); setNewFolder(''); setAddingFolder(true); }}>New folder</Button>
        <Select style={{ width: 140 }} value={by} onChange={v => changeBy(v)}
          options={[{ value: 'date', label: 'Date' }, { value: 'name', label: 'Name' }]} />
        </Space>
      </Space>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 380px) 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 8 }}>
          <Tree.DirectoryTree treeData={toTree(folders)} selectedKeys={[folder?.key]}
            expandedKeys={[...new Set([...expanded, ...trail.slice(0, -1).map(f => f.key)])]} onExpand={keys => setExpanded(keys.map(String))}
            icon={(p: any) => (p.expanded ? <FolderOpenOutlined /> : <FolderOutlined />)}
            onSelect={keys => keys[0] && setSelected(String(keys[0]))} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <Breadcrumb items={trail.map(f => ({ title: <a onClick={() => setSelected(f.key)}>{f.title}</a> }))} />
            {bankId && (
              <Space wrap>
                <Text type="secondary">Statement for</Text>
                <DatePicker picker="month" format="MMMM YYYY" allowClear={false} value={month} onChange={d => d && setMonth(d)} />
                <Upload showUploadList={false} beforeUpload={file => {
                  saveBankStatement(companyId, file, bankId, month.format('YYYY-MM'))
                    .then(r => { message.success(r === 'kept-old' ? 'Kept the statement that was already there' : `${file.name} saved as the ${month.format('MMMM YYYY')} statement`); load(); })
                    .catch(e => message.error(e.message));
                  return false;
                }}>
                  <Button icon={<UploadOutlined />}>Upload statement</Button>
                </Upload>
              </Space>
            )}
            {folder?.upload && (
              <Space wrap>
                {folder.userPath && !folder.children.length && !folder.files.length && (
                  <Popconfirm title={`Delete the folder ${folder.title}?`} onConfirm={async () => {
                    try {
                      await documentFolderService.save(companyId, userFolders.filter(p => p !== folder.userPath && !p.startsWith(`${folder.userPath}/`)));
                      setSelected(trail[trail.length - 2]?.key || 'payslips'); load();
                    } catch (e: any) { message.error(e.message); }
                  }}>
                    <Button danger icon={<DeleteOutlined />}>Delete folder</Button>
                  </Popconfirm>
                )}
                {folder.userPath && <Button icon={<FolderAddOutlined />} onClick={() => { setFolderParent(folder.userPath!); setNewFolder(''); setAddingFolder(true); }}>New folder</Button>}
                <Upload multiple showUploadList={false} beforeUpload={file => {
                  companyFileService.add(companyId, file, { folder: folder.upload!, subfolder: folder.userPath || null })
                    .then(() => { message.success(`${file.name} uploaded`); load(); }).catch(e => message.error(e.message));
                  return false;
                }}>
                  <Button icon={<UploadOutlined />}>Upload</Button>
                </Upload>
              </Space>
            )}
          </div>
          {trail[0]?.key === 'bank' && (
            <Space style={{ marginBottom: 12 }} wrap>
              <Text type="secondary">If a month already has a statement</Text>
              <Select style={{ width: 200 }} value={dupPref} onChange={v => { setDupPref(v); statementPrefService.set(companyId, v).catch(e => message.error(e.message)); }}
                options={[{ value: 'ask', label: 'Ask me' }, { value: 'new', label: 'Keep the new one' }, { value: 'old', label: 'Keep the old one' }, { value: 'both', label: 'Keep both' }]} />
            </Space>
          )}
          {folder?.key === 'bank' && !folder.children.length && (
            <Alert type="info" showIcon style={{ marginBottom: 12 }} title="Bank statements you import in Finance → Bank are kept here, in a folder for each bank." />
          )}
          {folder?.children.length ? (
            <Table rowKey="key" size="small" pagination={false} showHeader={false} style={{ marginBottom: rows.length ? 12 : 0 }} dataSource={folder.children.map(f => ({ key: f.key, title: f.title }))}
              onRow={f => ({ onClick: () => setSelected(f.key), style: { cursor: 'pointer' } })}
              columns={[{ key: 'n', render: (_, f: { key: string; title: string }) => <Space><FolderOutlined />{f.title}</Space> }]} />
          ) : null}
          {!rows.length ? (!folder?.children.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Nothing here yet" />) : (
            <Table rowKey="key" size="small" dataSource={rows} pagination={{ pageSize: 50, hideOnSinglePage: true }}
              columns={[
                { title: 'Name', key: 'n', render: (_, r: Row) => <Space>{/\.pdf$/i.test(r.name) || r.kind !== 'stored' ? <FilePdfOutlined /> : <FileOutlined />}<a onClick={() => act(r, 'open')}>{r.name}</a></Space> },
                { title: 'Date', dataIndex: 'date', width: 120 },
                {
                  title: '', key: 'a', width: 150, render: (_, r: Row) => (
                    <Space size={4}>
                      <Button size="small" icon={<EyeOutlined />} loading={busy === r.key} onClick={() => act(r, 'open')} title="Open" />
                      <Button size="small" icon={<DownloadOutlined />} onClick={() => act(r, 'download')} title="Download" />
                      {r.kind === 'stored' && r.fileId && (
                        <Popconfirm title={`Delete ${r.name}?`} onConfirm={async () => {
                          const f = files.find(x => x.id === r.fileId);
                          if (f) { try { await companyFileService.remove(f); load(); } catch (e: any) { message.error(e.message); } }
                        }}>
                          <Button size="small" danger icon={<DeleteOutlined />} title="Delete" />
                        </Popconfirm>
                      )}
                    </Space>
                  ),
                },
              ]} />
          )}
          {folder && rows.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>{rows.length} files</Text>}
        </div>
      </div>
      <Modal open={addingFolder} title={folderParent ? `New folder in ${folderParent.split('/').pop()}` : 'New folder'} okText="Create" onCancel={() => setAddingFolder(false)}
        okButtonProps={{ disabled: !newFolder.trim() || newFolder.includes('/') }}
        onOk={async () => {
          const path = [folderParent, newFolder.trim()].filter(Boolean).join('/');
          try {
            await documentFolderService.save(companyId, [...userFolders, path]);
            setAddingFolder(false); setSelected(`other/${path}`); load();
          } catch (e: any) { message.error(e.message); }
        }}>
        <Input autoFocus value={newFolder} onChange={e => setNewFolder(e.target.value)} />
      </Modal>
    </div>
  );
}

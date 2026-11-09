import { useState, useEffect, useCallback, useMemo } from 'react';
import { renderPdf } from '../../../utils/renderPdf';
import { Typography, Tree, Table, Button, Space, Upload, Empty, Spin, message, Popconfirm, Alert, Breadcrumb, DatePicker, Select, Modal, Input } from 'antd';
import dayjs from 'dayjs';
import { FolderOutlined, FolderOpenOutlined, FilePdfOutlined, FileOutlined, DownloadOutlined, EyeOutlined, UploadOutlined, DeleteOutlined, FolderAddOutlined, EditOutlined, FileExcelOutlined, FileWordOutlined, FilePptOutlined } from '@ant-design/icons';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import { brandingService, type Branding } from '../../../services/branding';
import { payrollService, type PayrollRunRow, type PayslipRow } from '../../../services/payroll';
import { hrService, type Employee } from '../../../services/hr';
import {
  docService, contactService, accountService, financeSettingsService, catalogService, attachmentService, companyFileService, statementPrefService, documentFolderService, ATTACH_TYPES,
  type Attachment, type CompanyFile, type DuplicateStatement,
} from '../../../services/finance';
import { DEFAULT_FINANCE_SETTINGS, DOC_LABEL, type FinDocument, type FinanceSettings, type Contact, type ContactPerson } from '../../../data/finance';
import { lineText, type CatalogItem } from '../../../data/catalog';
import { buildFolders, type Folder, type DocFile } from '../../../data/documents';
import { downloadBlob, formatFileName, formatDocFileName, zipFiles } from '../../../utils/payslipFiles';
import { PayslipView } from './hr/PayslipView';
import { DocumentView } from './finance/DocumentView';
import { FileViewer } from '../../../components/FileViewer';
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
  // renaming a stored file, an attached file, or one of the company's own folders
  // drag and drop: a folder of the company's own onto another own folder (or the top level), a file onto a folder
  const moveFolderTo = async (from: string, parent: string) => {
    if (!companyId) return;
    const leaf = from.split('/').pop()!, to = [parent, leaf].filter(Boolean).join('/');
    if (to === from) return;
    if (parent === from || parent.startsWith(`${from}/`)) { message.error("A folder can't go inside itself"); return; }
    if (userFolders.includes(to)) { message.error(`There is already a folder called ${leaf} there`); return; }
    try {
      await documentFolderService.save(companyId, userFolders.map(p => (p === from || p.startsWith(`${from}/`) ? to + p.slice(from.length) : p)));
      await companyFileService.moveFolder(files, from, to);
      setSelected(`other/${to}`); load();
    } catch (e: any) { message.error(e.message); }
  };
  const moveFileTo = async (id: number, subfolder: string) => {
    try { await companyFileService.moveFile(id, subfolder); message.success('Moved'); load(); } catch (e: any) { message.error(e.message); }
  };
  /** The own-folder path of a tree key ('other' = Other files → ''), or null for the built-in folders. */
  const ownPath = (key: string): string | null => (key === 'other' ? '' : key.startsWith('other/') ? key.slice(6) : null);
  const [renaming, setRenaming] = useState<{ kind: 'file' | 'att' | 'folder'; id?: number; path?: string; name: string } | null>(null);
  const doRename = async () => {
    if (!renaming || !companyId) return;
    let name = renaming.name.trim();
    try {
      if (renaming.kind === 'folder') {
        const from = renaming.path!, to = [...from.split('/').slice(0, -1), name.replace(/\//g, '-')].join('/');
        if (to !== from) {
          await documentFolderService.save(companyId, userFolders.map(p => (p === from || p.startsWith(`${from}/`) ? to + p.slice(from.length) : p)));
          await companyFileService.moveFolder(files, from, to);
          setSelected(`other/${to}`);
        }
      } else {
        // keep the file type if it was left off
        const old = renaming.kind === 'file' ? files.find(f => f.id === renaming.id)?.file_name : attachments.find(a => a.id === renaming.id)?.file_name;
        const ext = (old || '').match(/\.[A-Za-z0-9]{2,5}$/)?.[0];
        if (ext && !name.toLowerCase().endsWith(ext.toLowerCase())) name += ext;
        if (renaming.kind === 'file') await companyFileService.rename(renaming.id!, name); else await attachmentService.rename(renaming.id!, name);
      }
      setRenaming(null); load();
    } catch (e: any) { message.error(e.message); }
  };
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
  // Download all: every folder and file, laid out as on the left, in one .zip
  const [zipping, setZipping] = useState<{ done: number; total: number } | null>(null);
  const downloadAll = async () => {
    const all: { path: string; row: Row }[] = [];
    const safe = (t: string) => t.replace(/[\\/:*?"<>|]/g, '-').trim() || 'Untitled';
    const walk = (list: Folder[], base: string) => list.forEach(f => {
      const here = `${base}${safe(f.title)}/`;
      f.files.forEach(r => all.push({ path: here, row: r }));
      walk(f.children, here);
    });
    walk(folders, '');
    if (!all.length) { message.info('No documents yet'); return; }
    setZipping({ done: 0, total: all.length });
    const out: { name: string; blob: Blob }[] = [], used = new Set<string>(), failed: string[] = [];
    for (let i = 0; i < all.length; i++) {
      const { path, row } = all[i];
      try {
        const { blob, name } = await fileOf(row);
        // the same name twice in a folder gets (2), (3)…
        let n = `${path}${safe(name)}`, k = 2;
        while (used.has(n.toLowerCase())) n = `${path}${safe(name).replace(/(\.[^.]+)?$/, m => ` (${k}${')'}${m}`)}`, k++;
        used.add(n.toLowerCase()); out.push({ name: n, blob });
      } catch { failed.push(row.name); }
      setZipping({ done: i + 1, total: all.length });
    }
    try {
      const zip = await zipFiles(out);
      downloadBlob(zip, `${safe(coName || 'Company')} documents ${dayjs().format('YYYY-MM-DD')}.zip`);
      if (failed.length) message.warning(`${failed.length} file${failed.length === 1 ? '' : 's'} couldn't be added: ${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}`);
    } catch (e: any) { message.error(e.message); }
    setZipping(null);
  };
  // open: show it in the viewer popup; download: save it
  const [viewing, setViewing] = useState<Row | null>(null);
  const act = async (r: Row, how: 'open' | 'download') => {
    if (how === 'open') { setViewing(r); return; }
    setBusy(r.key);
    try { const { blob, name } = await fileOf(r); downloadBlob(blob, name); } catch (e: any) { message.error(e.message); }
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
        <Button icon={<DownloadOutlined />} loading={!!zipping} onClick={downloadAll}>
          {zipping ? `Preparing ${zipping.done} / ${zipping.total}` : 'Download all'}
        </Button>
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
            onSelect={keys => keys[0] && setSelected(String(keys[0]))}
            // own folders can be dragged into another own folder, or between the top-level folders to go to the top
            draggable={{ icon: false, nodeDraggable: n => !!ownPath(String(n.key)) }}
            allowDrop={({ dropNode, dropPosition }) => {
              const k = String(dropNode.key);
              if (dropPosition === 0) return !!ownPath(k);                      // into one of the own folders
              return ownPath(k) !== null || !k.includes('/');                  // beside a folder: next to it
            }}
            onDrop={info => {
              const from = ownPath(String(info.dragNode.key)), k = String(info.node.key);
              if (!from) return;
              const into = !info.dropToGap ? ownPath(k) : null;
              moveFolderTo(from, into ?? (ownPath(k) ?? '').split('/').slice(0, -1).join('/'));
            }}
            // files dragged from the list onto a folder
            titleRender={(n: any) => {
              const target = ownPath(String(n.key));
              return (
                <span onDragOver={e => { if (target !== null && e.dataTransfer.types.includes('qv-file')) e.preventDefault(); }}
                  onDrop={e => { const id = Number(e.dataTransfer.getData('qv-file')); if (target !== null && id) { e.preventDefault(); e.stopPropagation(); moveFileTo(id, target); } }}>
                  {n.title}
                </span>
              );
            }} />
        </div>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
            <Breadcrumb items={trail.map(f => ({ title: <a onClick={() => setSelected(f.key)}>{f.title}</a> }))} />
            {bankId && (
              <Space wrap>
                <Text type="secondary">Statement for</Text>
                <DatePicker picker="month" format="MMMM YYYY" allowClear={false} value={month} onChange={d => d && setMonth(d)} />
                <Upload accept={ATTACH_TYPES} showUploadList={false} beforeUpload={file => {
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
                {folder.userPath && <Button icon={<EditOutlined />} onClick={() => setRenaming({ kind: 'folder', path: folder.userPath, name: folder.title })}>Rename</Button>}
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
                <Upload accept={ATTACH_TYPES} multiple showUploadList={false} beforeUpload={file => {
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
              onRow={r => {
                // files in own folders / Other files can be dragged onto a folder on the left
                const f = r.kind === 'stored' && r.fileId ? files.find(x => x.id === r.fileId) : undefined;
                return f?.folder === 'other' ? { draggable: true, style: { cursor: 'grab' }, onDragStart: e => { e.dataTransfer.setData('qv-file', String(f.id)); e.dataTransfer.effectAllowed = 'move'; } } : {};
              }}
              columns={[
                { title: 'Name', key: 'n', sorter: (a: Row, b: Row) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }), render: (_, r: Row) => <Space>{/\.pdf$/i.test(r.name) || r.kind !== 'stored' ? <FilePdfOutlined /> : /\.(xlsx?|xlsm|csv)$/i.test(r.name) ? <FileExcelOutlined /> : /\.docx?$/i.test(r.name) ? <FileWordOutlined /> : /\.pptx?$/i.test(r.name) ? <FilePptOutlined /> : <FileOutlined />}<a onClick={() => act(r, 'open')}>{r.name}</a></Space> },
                { title: 'Date', dataIndex: 'date', width: 120, sorter: (a: Row, b: Row) => a.date.localeCompare(b.date) },
                {
                  title: '', key: 'a', width: 220, render: (_, r: Row) => (
                    <Space size={4}>
                      <Button size="small" icon={<EyeOutlined />} loading={busy === r.key} onClick={() => act(r, 'open')} title="Open" />
                      <Button size="small" icon={<DownloadOutlined />} onClick={() => act(r, 'download')} title="Download" />
                      {r.kind === 'stored' && (r.fileId || r.attachmentId) && (
                        <Button size="small" icon={<EditOutlined />} title="Rename" onClick={() => {
                          const cur = r.fileId ? files.find(f => f.id === r.fileId)?.file_name : attachments.find(a => a.id === r.attachmentId)?.file_name;
                          setRenaming({ kind: r.fileId ? 'file' : 'att', id: (r.fileId || r.attachmentId)!, name: cur || r.name });
                        }} />
                      )}
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
      <Modal open={!!renaming} title="Rename" okText="Save" onCancel={() => setRenaming(null)} okButtonProps={{ disabled: !renaming?.name.trim() }} onOk={doRename}>
        <Input autoFocus value={renaming?.name || ''} onChange={e => setRenaming(r => (r ? { ...r, name: e.target.value } : r))} onPressEnter={doRename} />
      </Modal>
      {viewing && <FileViewer name={viewing.kind === 'stored' ? viewing.name : viewing.name.replace(/(\.pdf)?$/i, '.pdf')} load={() => fileOf(viewing).then(x => x.blob)} onClose={() => setViewing(null)} />}
    </div>
  );
}

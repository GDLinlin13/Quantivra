import { useState, useRef, useEffect, useCallback, type ReactNode, type KeyboardEvent as RKeyboardEvent } from 'react';
import { Button, Tooltip, Select, InputNumber, ColorPicker, Dropdown, Segmented, Space, Input, Divider, Typography, Popconfirm, Collapse, Modal } from 'antd';
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined, AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined,
  VerticalAlignTopOutlined, VerticalAlignMiddleOutlined, VerticalAlignBottomOutlined, BorderOutlined,
  MergeCellsOutlined, SplitCellsOutlined, InsertRowAboveOutlined, InsertRowBelowOutlined, InsertRowLeftOutlined,
  InsertRowRightOutlined, DeleteRowOutlined, DeleteColumnOutlined, UndoOutlined, RedoOutlined, ClearOutlined, ReloadOutlined,
} from '@ant-design/icons';
import {
  key, colName, coveredSet, mergeAt, normRange, expandRange, mergeRange, unmergeRange, insertRow, deleteRow, insertCol, deleteCol,
  blankTemplate, resetSizes, toA4, styleRange, outlineRange, isLogoCell, rowUsesList, AUTO_REPEAT, moveRange, copyBlock, pasteBlock, clearArea, type Block, type GridTemplate, type GridCell, type Range,
} from '../utils/gridTemplate';
import { docFields, docLists, STARTER_LAYOUTS, sampleData, fieldShortName, listExample, plainAmount, type DocKind } from '../data/documentLayouts';
import { GridDocument, cellStyle, LogoImg, spanHeight } from './GridDocument';

const { Text } = Typography;
const FIELD_SPLIT = /(\{\{\s*[a-z0-9_.]+\s*\}\})/gi;
const FONT_SIZES = [9, 10, 11, 12, 13, 14, 16, 18, 20, 22, 24, 28, 32];
const HEADER_BG = '#e9ecef';
const SELECT_BLUE = '#1677ff';

type Pos = { r: number; c: number };

/** Shows {{fields}} as little blue chips so they stand out from plain text. */
function CellText({ v, kind }: { v: string; kind: DocKind }) {
  const parts = v.split(FIELD_SPLIT);
  return (
    <>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <span key={i}>{p}</span>;
        const name = p.replace(/[{}\s]/g, '');
        const short = fieldShortName(kind, name);
        return (
          <span key={i} title={`${p} — filled in when printed`}
            style={{ background: short ? '#e6f0ff' : '#fde2e1', color: short ? '#0b57d0' : '#b42318', borderRadius: 3, padding: '0 3px', fontSize: '0.9em', whiteSpace: 'nowrap' }}>
            {short ? `⟨${short}⟩` : `${p} ?`}
          </span>
        );
      })}
    </>
  );
}

/** "What can I type?" — plain-language help for the fields and repeating rows. */
function FieldGuide({ kind, country, onInsert, rowRepeat, sample }: {
  kind: DocKind; country?: string | null; onInsert: (name: string) => void; rowRepeat?: string;
  sample: { fields: Record<string, string>; lists: Record<string, Record<string, string>[]> };
}) {
  const lists = docLists(kind, country);
  const sg = (country || 'SG').toUpperCase() === 'SG';
  const hk = (country || '').toUpperCase() === 'HK';
  const cellStyleTd: React.CSSProperties = { padding: '3px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'top' };
  const code: React.CSSProperties = { fontFamily: 'monospace', fontSize: 12, color: '#91caff', cursor: 'pointer', whiteSpace: 'nowrap' };
  const [example, setExample] = useState(false);
  // fields and the lines of the lists, together; shown in two halves
  const all = [...docFields(kind, country), ...lists.flatMap(l => l.fields.map(f => ({ ...f, label: `${l.label}: ${f.label}` })))];
  const half = Math.ceil(all.length / 2);
  const first = lists[0];
  const shownCols = first ? first.fields.slice(0, 3) : [];
  const printed = first ? (sample.lists[first.name] || []).slice(0, 3) : [];
  const th: React.CSSProperties = { border: '1px solid #ccc', padding: '3px 8px', textAlign: 'left', fontWeight: 500 };
  const C = ({ n }: { n: string }) => <code style={code} onClick={() => onInsert(n)} title="Click to put it in the selected cell">{`{{${n}}}`}</code>;
  return (
    <div style={{ color: 'rgba(240,237,230,0.8)', fontSize: 13, lineHeight: 1.55, maxHeight: 420, overflowY: 'auto' }}>
      <div style={{ marginBottom: 6 }}>
        {kind === 'letterhead'
          ? <>Put <C n="document_title" />, <C n="document_date" /> and <C n="document_body" /> in it.</>
          : lists.length > 0 && <Button size="small" onClick={() => setExample(true)}>View example</Button>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: '0 16px' }}>
        {[all.slice(0, half), all.slice(half)].map((col, ci) => (
          <table key={ci} style={{ borderCollapse: 'collapse', width: '100%', alignSelf: 'start' }}>
            <tbody>
              {col.map(f => (
                <tr key={f.name}>
                  <td style={cellStyleTd}><span style={code} onClick={() => onInsert(f.name)} title="Click to put it in the selected cell">{`{{${f.name}}}`}</span></td>
                  <td style={cellStyleTd}>{f.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      <Modal open={example} onCancel={() => setExample(false)} footer={null} title="Example" width={560}>
        {first && (
          <div style={{ fontSize: 13 }}>
            <div style={{ marginBottom: 6 }}>You design <b>one</b> row with the fields of a list ({first.label}). It turns yellow ↻ and is repeated for each item.</div>
            <table style={{ borderCollapse: 'collapse', width: '100%', marginBottom: 12 }}><tbody>
              <tr style={{ background: '#fffbeb' }}>{shownCols.map(f => <td key={f.name} style={{ ...th, fontFamily: 'monospace', color: '#0b57d0' }}>{`{{${f.name}}}`}{f === shownCols[0] ? ' ↻' : ''}</td>)}</tr>
            </tbody></table>
            <div style={{ marginBottom: 6 }}>When printed:</div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}><tbody>
              {printed.map((r, i) => <tr key={i}>{shownCols.map(f => <td key={f.name} style={th}>{plainAmount(r[f.name.split('.').pop()!] || '')}</td>)}</tr>)}
            </tbody></table>
          </div>
        )}
      </Modal>
    </div>
  );
}

export function GridTemplateEditor({ kind, value, onChange, company, branding }: {
  kind: DocKind;
  value: GridTemplate;
  onChange: (t: GridTemplate) => void;
  company: any;
  branding: any;
}) {
  const [mode, setMode] = useState<'design' | 'preview'>('design');
  const [guideOpen] = useState(() => { try { return localStorage.getItem('qv-layout-guide') !== '0'; } catch { return true; } });
  const [anchor, setAnchor] = useState<Pos>({ r: 0, c: 0 });
  const [focus, setFocus] = useState<Pos>({ r: 0, c: 0 });
  const [editing, setEditing] = useState<{ pos: Pos; text: string } | null>(null);
  const dragging = useRef(false);
  const undo = useRef<GridTemplate[]>([]);
  const redo = useRef<GridTemplate[]>([]);
  const gridRef = useRef<HTMLDivElement>(null);
  const resizing = useRef<{ kind: 'col' | 'row'; idx: number; start: number; orig: number } | null>(null);
  const [, force] = useState(0);
  // dragging a selection by its border moves it; grab = where in the selection it was picked up
  const moving = useRef<{ src: Range; grabR: number; grabC: number } | null>(null);
  const [moveTo, setMoveToState] = useState<Pos | null>(null);
  const moveToRef = useRef<Pos | null>(null);
  const setMoveTo = (p: Pos | null) => { moveToRef.current = p; setMoveToState(p); };
  const clip = useRef<Block | null>(null);

  const t = value;
  const covered = coveredSet(t);
  const range: Range = expandRange(t, normRange(anchor, focus));
  const cur: GridCell = t.cells[key(focus.r, focus.c)] || {};
  const curRow = t.rows[focus.r] || {};

  const commit = useCallback((next: GridTemplate) => {
    undo.current.push(t);
    if (undo.current.length > 100) undo.current.shift();
    redo.current = [];
    onChange(next);
  }, [t, onChange]);

  const doUndo = () => { const p = undo.current.pop(); if (p) { redo.current.push(t); onChange(p); } };
  const doRedo = () => { const n = redo.current.pop(); if (n) { undo.current.push(t); onChange(n); } };

  const clampPos = (p: Pos): Pos => ({ r: Math.max(0, Math.min(t.rows.length - 1, p.r)), c: Math.max(0, Math.min(t.cols.length - 1, p.c)) });
  // keep the selection inside the sheet after rows/columns are deleted
  useEffect(() => {
    setAnchor(a => clampPos(a)); setFocus(f => clampPos(f));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t.rows.length, t.cols.length]);

  const setText = (p: Pos, text: string) => {
    const cell = t.cells[key(p.r, p.c)] || {};
    if ((cell.v || '') === text) return;
    const next: GridTemplate = { ...t, cells: { ...t.cells, [key(p.r, p.c)]: { ...cell, v: text } } };
    // A row repeats exactly when it shows a list: switch it on or off to match.
    const uses = rowUsesList(next, p.r);
    if (uses !== !!t.rows[p.r]?.repeat) {
      const rows = [...t.rows];
      if (uses) rows[p.r] = { ...rows[p.r], repeat: AUTO_REPEAT };
      else { const { repeat: _r, ...rest } = rows[p.r]; rows[p.r] = rest; }
      next.rows = rows;
    }
    commit(next);
  };

  const style = (patch: Partial<GridCell>) => commit(styleRange(t, range, patch));
  const toggle = (k: 'b' | 'i' | 'u') => style({ [k]: !cur[k] });

  const borders = (how: 'all' | 'outline' | 'top' | 'bottom' | 'dtop' | 'dbottom' | 'none') => {
    if (how === 'all') return style({ bt: true, br: true, bb: true, bl: true, dbt: false, dbb: false });
    if (how === 'none') return style({ bt: false, br: false, bb: false, bl: false, dbt: false, dbb: false });
    if (how === 'outline') return commit(outlineRange(t, range, true));
    if (how === 'top') return commit(styleRange(t, { ...range, r2: range.r1 }, { bt: true, dbt: false }));
    if (how === 'dtop') return commit(styleRange(t, { ...range, r2: range.r1 }, { dbt: true }));
    if (how === 'dbottom') return commit(styleRange(t, { ...range, r1: range.r2 }, { dbb: true }));
    return commit(styleRange(t, { ...range, r1: range.r2 }, { bb: true, dbb: false }));
  };

  const move = (dr: number, dc: number, extend = false) => {
    // step off the edge of a merged cell, and land on a merge's top-left cell
    const here = t.cells[key(focus.r, focus.c)];
    let p = { r: focus.r + (dr > 0 ? (here?.rs || 1) : dr), c: focus.c + (dc > 0 ? (here?.cs || 1) : dc) };
    p = clampPos(p);
    const m = mergeAt(t, p.r, p.c);
    if (m) p = { r: m.r, c: m.c };
    setFocus(p);
    if (!extend) setAnchor(p);
  };

  const startEdit = (initial?: string) => {
    if (covered.has(key(focus.r, focus.c))) return;
    setEditing({ pos: focus, text: initial ?? (cur.v || '') });
  };
  const finishEdit = (save: boolean, then?: () => void) => {
    if (editing && save) setText(editing.pos, editing.text);
    setEditing(null);
    gridRef.current?.focus();
    then?.();
  };

  const onKey = (e: RKeyboardEvent) => {
    if (editing || mode !== 'design') return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? doRedo() : doUndo(); }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); return doRedo(); }
    if (mod && e.key.toLowerCase() === 'b') { e.preventDefault(); return toggle('b'); }
    if (mod && e.key.toLowerCase() === 'i') { e.preventDefault(); return toggle('i'); }
    if (mod && e.key.toLowerCase() === 'u') { e.preventDefault(); return toggle('u'); }
    if (mod && e.key.toLowerCase() === 'c') { e.preventDefault(); clip.current = copyBlock(t, range); return; }
    if (mod && e.key.toLowerCase() === 'x') { e.preventDefault(); clip.current = copyBlock(t, range); return commit(clearArea(t, range)); }
    if (mod && e.key.toLowerCase() === 'v') {
      e.preventDefault();
      const b = clip.current;
      if (!b) return;
      const at = { r: range.r1, c: range.c1 };
      commit(pasteBlock(t, b, at));
      setAnchor(at); setFocus({ r: at.r + b.h - 1, c: at.c + b.w - 1 });
      return;
    }
    switch (e.key) {
      case 'ArrowUp': e.preventDefault(); return move(-1, 0, e.shiftKey);
      case 'ArrowDown': e.preventDefault(); return move(1, 0, e.shiftKey);
      case 'ArrowLeft': e.preventDefault(); return move(0, -1, e.shiftKey);
      case 'ArrowRight': e.preventDefault(); return move(0, 1, e.shiftKey);
      case 'Tab': e.preventDefault(); return move(0, e.shiftKey ? -1 : 1);
      case 'Enter': case 'F2': e.preventDefault(); return startEdit();
      case 'Delete': case 'Backspace':
        e.preventDefault();
        return commit(styleRange(t, range, cell => { const { v: _v, ...rest } = cell; return rest; }));
    }
    if (e.key.length === 1 && !mod && !e.altKey) { e.preventDefault(); startEdit(e.key); }
  };

  // column / row resizing by dragging the header edges
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const rz = resizing.current;
      if (!rz) return;
      const delta = (rz.kind === 'col' ? e.clientX : e.clientY) - rz.start;
      if (rz.kind === 'col') {
        const cols = [...t.cols]; cols[rz.idx] = Math.max(20, Math.round(rz.orig + delta));
        onChange({ ...t, cols });
      } else {
        const rows = [...t.rows]; rows[rz.idx] = { ...rows[rz.idx], h: Math.max(6, Math.round(rz.orig + delta)) };
        onChange({ ...t, rows });
      }
    };
    const onUp = () => {
      dragging.current = false;
      if (resizing.current) { resizing.current = null; force(x => x + 1); }
      const mv = moving.current;
      if (mv) {
        moving.current = null;
        const dest = moveToRef.current;
        setMoveTo(null);
        if (dest && (dest.r !== mv.src.r1 || dest.c !== mv.src.c1)) {
          commit(moveRange(t, mv.src, dest));
          setAnchor(dest);
          setFocus({ r: dest.r + (mv.src.r2 - mv.src.r1), c: dest.c + (mv.src.c2 - mv.src.c1) });
        }
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [t, onChange, commit]);

  const startResize = (kind: 'col' | 'row', idx: number, e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    undo.current.push(t); redo.current = [];
    resizing.current = { kind, idx, start: kind === 'col' ? e.clientX : e.clientY, orig: kind === 'col' ? t.cols[idx] : (t.rows[idx].h || 22) };
  };

  const inRange = (r: number, c: number) => r >= range.r1 && r <= range.r2 && c >= range.c1 && c <= range.c2;

  /** Which edges of this cell sit on the outside of the selection. */
  const edgesOf = (r: number, c: number, cell: GridCell) => ({
    top: r === range.r1, left: c === range.c1,
    bottom: r + (cell.rs || 1) - 1 === range.r2, right: c + (cell.cs || 1) - 1 === range.c2,
  });
  /** True when the mouse is on the selection's blue border (the place you grab to move it). */
  const onBorder = (e: React.MouseEvent<HTMLTableCellElement>, r: number, c: number, cell: GridCell) => {
    if (!inRange(r, c) || editing) return false;
    const rect = e.currentTarget.getBoundingClientRect();
    const ed = edgesOf(r, c, cell);
    const z = 6;
    return (ed.top && e.clientY - rect.top < z) || (ed.bottom && rect.bottom - e.clientY < z)
      || (ed.left && e.clientX - rect.left < z) || (ed.right && rect.right - e.clientX < z);
  };
  const inMoveTarget = (r: number, c: number) => {
    if (!moveTo) return false;
    const h = range.r2 - range.r1, w = range.c2 - range.c1;
    return r >= moveTo.r && r <= moveTo.r + h && c >= moveTo.c && c <= moveTo.c + w;
  };

  const country = company?.country;
  const lists = docLists(kind, country);
  const legacyList = lists.find(l => l.name === curRow.repeat);
  const fieldOptions = [
    ...(legacyList ? [{ label: `This row's item (older layouts)`, options: legacyList.fields.map(f => ({ value: `line.${f.name.split('.')[1]}`, label: `${f.label}  {{line.${f.name.split('.')[1]}}}` })) }] : []),
    { label: 'Fields — one value', options: docFields(kind, country).map(f => ({ value: f.name, label: `${f.label}  {{${f.name}}}` })) },
    ...lists.map(l => ({ label: `List: ${l.label} — row repeats per item`, options: l.fields.map(f => ({ value: f.name, label: `${f.label}  {{${f.name}}}` })) })),
  ];
  const insertField = (name: string) => {
    const txt = `{{${name}}}`;
    if (editing) { setEditing({ ...editing, text: editing.text + txt }); return; }
    setText(focus, name === 'logo' ? txt : (cur.v || '') + txt);
  };

  const addr = range.r1 === range.r2 && range.c1 === range.c2
    ? `${colName(focus.c)}${focus.r + 1}`
    : `${colName(range.c1)}${range.r1 + 1}:${colName(range.c2)}${range.r2 + 1}`;

  const sample = sampleData(kind, company, branding);
  const btn = (title: string, icon: ReactNode, onClick: () => void, active = false, disabled = false) => (
    <Tooltip title={title}><Button size="small" type={active ? 'primary' : 'default'} icon={icon} onClick={onClick} disabled={disabled} /></Tooltip>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 8 }}>
        <Segmented value={mode} onChange={v => { finishEdit(true); setMode(v as any); }}
          options={[{ label: 'Design', value: 'design' }, { label: 'Preview with example data', value: 'preview' }]} />
        <Space size={6} wrap>
          <Popconfirm title="Reset all column widths and row heights?" description="The text and formatting stay; only the sizes go back to the standard (you can still Undo)."
            onConfirm={() => commit(resetSizes(t))}>
            <Button size="small">Reset all sizes</Button>
          </Popconfirm>
          <Popconfirm title="Clear everything?" description="Every cell, format and size is removed and you get an empty sheet (you can still Undo)."
            onConfirm={() => { commit({ ...blankTemplate(), enabled: t.enabled }); setAnchor({ r: 0, c: 0 }); setFocus({ r: 0, c: 0 }); }}>
            <Button size="small" icon={<ClearOutlined />} danger>Clear everything</Button>
          </Popconfirm>
                <Popconfirm title="Replace this layout with the starter layout?" description="Your current layout will be lost (you can still Undo)." onConfirm={() => commit({ ...toA4(STARTER_LAYOUTS[kind](country, branding)), enabled: t.enabled })}>
            <Button size="small" icon={<ReloadOutlined />}>Start again from the starter layout</Button>
          </Popconfirm>
        </Space>
      </div>

      {mode === 'design' && (
        <>
          <Collapse size="small" style={{ marginBottom: 8, background: '#151a1e' }} defaultActiveKey={guideOpen ? ['g'] : []}
            onChange={k => { const open = (Array.isArray(k) ? k : [k]).includes('g'); try { localStorage.setItem('qv-layout-guide', open ? '1' : '0'); } catch { /* ignore */ } }}
            items={[{ key: 'g', label: 'Code Guide', children: <FieldGuide kind={kind} country={country} onInsert={insertField} rowRepeat={curRow.repeat} sample={sample} /> }]} />
          {/* toolbar */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', padding: 6, background: '#1d2328', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px 6px 0 0' }}>
            {btn('Undo (Ctrl+Z)', <UndoOutlined />, doUndo, false, undo.current.length === 0)}
            {btn('Redo (Ctrl+Y)', <RedoOutlined />, doRedo, false, redo.current.length === 0)}
            <Divider orientation="vertical" />
            {btn('Bold (Ctrl+B)', <BoldOutlined />, () => toggle('b'), !!cur.b)}
            {btn('Italic (Ctrl+I)', <ItalicOutlined />, () => toggle('i'), !!cur.i)}
            {btn('Underline (Ctrl+U)', <UnderlineOutlined />, () => toggle('u'), !!cur.u)}
            <Tooltip title="Font size">
              <Select size="small" style={{ width: 70 }} value={cur.fs || 12} onChange={v => style({ fs: v })}
                options={FONT_SIZES.map(s => ({ value: s, label: s }))} />
            </Tooltip>
            <Tooltip title="Text colour">
              <span><ColorPicker size="small" value={cur.c || '#111111'} onChangeComplete={c => style({ c: c.toHexString() })}
                presets={[{ label: 'Colours', colors: ['#111111', '#666666', '#999999', '#0b57d0', '#1677ff', '#15803d', '#b91c1c', '#c2410c', '#7c3aed'] }]} /></span>
            </Tooltip>
            <Tooltip title="Fill colour">
              <span><ColorPicker size="small" allowClear value={cur.bg || null} onChangeComplete={c => style({ bg: c.toHexString() })} onClear={() => style({ bg: undefined })}
                presets={[{ label: 'Fills', colors: ['#f2f2f2', '#e8f0fe', '#e6f4ea', '#fef7e0', '#fce8e6', '#f3e8fd', '#d9d9d9'] }]} /></span>
            </Tooltip>
            <Divider orientation="vertical" />
            {btn('Align left', <AlignLeftOutlined />, () => style({ al: 'left' }), (cur.al || 'left') === 'left')}
            {btn('Align centre', <AlignCenterOutlined />, () => style({ al: 'center' }), cur.al === 'center')}
            {btn('Align right', <AlignRightOutlined />, () => style({ al: 'right' }), cur.al === 'right')}
            {btn('Top', <VerticalAlignTopOutlined />, () => style({ va: 'top' }), (cur.va || 'top') === 'top')}
            {btn('Middle', <VerticalAlignMiddleOutlined />, () => style({ va: 'middle' }), cur.va === 'middle')}
            {btn('Bottom', <VerticalAlignBottomOutlined />, () => style({ va: 'bottom' }), cur.va === 'bottom')}
            <Divider orientation="vertical" />
            <Dropdown menu={{
              items: [
                { key: 'all', label: 'All borders' }, { key: 'outline', label: 'Outside border' },
                { key: 'top', label: 'Top border' }, { key: 'bottom', label: 'Bottom border' },
                { key: 'dtop', label: 'Double top border' }, { key: 'dbottom', label: 'Double bottom border' }, { key: 'none', label: 'No border' },
              ], onClick: ({ key: k }) => borders(k as any),
            }}>
              <Button size="small" icon={<BorderOutlined />}>Borders</Button>
            </Dropdown>
            {btn('Merge selected cells', <MergeCellsOutlined />, () => commit(mergeRange(t, range)), false, (range.r1 === range.r2 && range.c1 === range.c2) || (range.r1 !== range.r2 && t.rows.slice(range.r1, range.r2 + 1).some(r => r.repeat)))}
            {btn('Unmerge', <SplitCellsOutlined />, () => commit(unmergeRange(t, range)))}
            {btn('Clear formatting', <ClearOutlined />, () => commit(styleRange(t, range, cell => ({ ...(cell.v ? { v: cell.v } : {}), ...(cell.rs ? { rs: cell.rs } : {}), ...(cell.cs ? { cs: cell.cs } : {}) }))))}
            <Divider orientation="vertical" />
            {btn('Insert row above', <InsertRowAboveOutlined />, () => { commit(insertRow(t, range.r1)); })}
            {btn('Insert row below', <InsertRowBelowOutlined />, () => { commit(insertRow(t, range.r2 + 1)); })}
            {btn('Delete row', <DeleteRowOutlined />, () => commit(deleteRow(t, focus.r)), false, t.rows.length <= 1)}
            {btn('Insert column left', <InsertRowLeftOutlined />, () => commit(insertCol(t, range.c1)))}
            {btn('Insert column right', <InsertRowRightOutlined />, () => commit(insertCol(t, range.c2 + 1)))}
            {btn('Delete column', <DeleteColumnOutlined />, () => commit(deleteCol(t, focus.c)), false, t.cols.length <= 1)}
          </div>

          {/* second toolbar: data */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', padding: 6, background: '#1d2328', borderLeft: '1px solid rgba(255,255,255,0.08)', borderRight: '1px solid rgba(255,255,255,0.08)' }}>
            <Select size="small" showSearch placeholder="Insert a field into the selected cell…" style={{ width: 300 }} value={null as any}
              options={fieldOptions} onChange={insertField} optionFilterProp="label" />
            <Tooltip title="A repeating row is printed once per item of the lists used in it (e.g. one row per earning). Rows with list fields switch to repeating automatically.">
              <Space size={4}>
                <Text style={{ color: 'rgba(240,237,230,0.7)', fontSize: 12 }}>Row {focus.r + 1}</Text>
                <Select size="small" style={{ width: 230 }} value={curRow.repeat && rowUsesList(t, focus.r) ? curRow.repeat : ''}
                  onChange={v => {
                    const rows = [...t.rows];
                    rows[focus.r] = { ...rows[focus.r], repeat: v || undefined };
                    if (!v) delete rows[focus.r].repeat;
                    commit({ ...t, rows });
                  }}
                  options={[
                    { value: '', label: 'Does not repeat' },
                    { value: AUTO_REPEAT, label: 'Repeats — one row per list item' },
                    ...(legacyList ? [{ value: legacyList.name, label: `Repeats per ${legacyList.label.toLowerCase()} item` }] : []),
                  ]} />
              </Space>
            </Tooltip>
            <Space size={4}>
              <Text style={{ color: 'rgba(240,237,230,0.7)', fontSize: 12 }}>Column {colName(focus.c)} width</Text>
              <InputNumber size="small" min={20} max={800} style={{ width: 70 }} value={t.cols[focus.c]}
                onChange={v => { if (!v) return; const cols = [...t.cols]; cols[focus.c] = v; commit({ ...t, cols }); }} />
              <Text style={{ color: 'rgba(240,237,230,0.7)', fontSize: 12 }}>Row height</Text>
              <InputNumber size="small" min={6} max={300} style={{ width: 70 }} value={curRow.h || 22}
                onChange={v => { if (!v) return; const rows = [...t.rows]; rows[focus.r] = { ...rows[focus.r], h: v }; commit({ ...t, rows }); }} />
            </Space>
          </div>

          {/* formula bar */}
          <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none', background: '#fff' }}>
            <div style={{ width: 90, padding: '4px 8px', borderRight: '1px solid #ddd', color: '#333', fontSize: 12, fontFamily: 'monospace', display: 'flex', alignItems: 'center' }}>{addr}</div>
            <div style={{ padding: '4px 8px', color: '#888', fontStyle: 'italic', borderRight: '1px solid #ddd', display: 'flex', alignItems: 'center' }}>fx</div>
            <Input.TextArea variant="borderless" autoSize={{ minRows: 1, maxRows: 4 }} style={{ color: '#111', background: '#fff' }}
              value={editing ? editing.text : (covered.has(key(focus.r, focus.c)) ? '' : cur.v || '')}
              onFocus={() => { if (!editing) startEdit(); }}
              onChange={e => setEditing({ pos: editing?.pos || focus, text: e.target.value })}
              onBlur={() => finishEdit(true)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); finishEdit(true, () => move(1, 0)); }
                if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
              }} />
          </div>

          {/* the sheet */}
          <div ref={gridRef} tabIndex={0} onKeyDown={onKey}
            style={{ overflow: 'auto', maxHeight: 640, background: '#fff', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none', borderRadius: '0 0 6px 6px', outline: 'none', userSelect: 'none' }}>
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: 40 + t.cols.reduce((a, b) => a + b, 0), fontFamily: 'system-ui, -apple-system, sans-serif' }}>
              <colgroup>
                <col style={{ width: 40 }} />
                {t.cols.map((w, i) => <col key={i} style={{ width: w }} />)}
              </colgroup>
              <thead>
                <tr style={{ height: 22 }}>
                  <th style={{ background: HEADER_BG, border: '1px solid #cfd4d9', position: 'sticky', top: 0, zIndex: 3 }} />
                  {t.cols.map((_, c) => (
                    <th key={c}
                      onMouseDown={() => { setAnchor({ r: 0, c }); setFocus({ r: t.rows.length - 1, c }); }}
                      style={{ background: c >= range.c1 && c <= range.c2 ? '#d3e3fd' : HEADER_BG, border: '1px solid #cfd4d9', fontSize: 11, fontWeight: 500, color: '#444', position: 'sticky', top: 0, zIndex: 2, cursor: 'pointer' }}>
                      {colName(c)}
                      <div onMouseDown={e => startResize('col', c, e)} title="Drag to resize"
                        style={{ position: 'absolute', right: -1, top: 0, bottom: 0, width: 7, cursor: 'col-resize', zIndex: 4 }} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((row, r) => (
                  <tr key={r} style={{ height: row.h || 22 }}>
                    <th
                      onMouseDown={() => { setAnchor({ r, c: 0 }); setFocus({ r, c: t.cols.length - 1 }); }}
                      style={{ background: row.repeat && rowUsesList(t, r) ? '#fff4d6' : (r >= range.r1 && r <= range.r2 ? '#d3e3fd' : HEADER_BG), border: '1px solid #cfd4d9', fontSize: 11, fontWeight: 500, color: '#444', position: 'sticky', left: 0, zIndex: 1, cursor: 'pointer' }}>
                      <Tooltip title={row.repeat && rowUsesList(t, r) ? (row.repeat === AUTO_REPEAT ? 'Repeats once per item of the lists used in this row' : `Repeats once per ${lists.find(l => l.name === row.repeat)?.label.toLowerCase() || row.repeat} item`) : undefined} placement="right">
                        <span>{r + 1}{row.repeat && rowUsesList(t, r) ? ' ↻' : ''}</span>
                      </Tooltip>
                      <div onMouseDown={e => startResize('row', r, e)} title="Drag to resize"
                        style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 7, cursor: 'row-resize', zIndex: 4 }} />
                    </th>
                    {t.cols.map((_, c) => {
                      const k = key(r, c);
                      if (covered.has(k)) return null;
                      const cell = t.cells[k] || {};
                      const sel = inRange(r, c);
                      const isFocus = focus.r === r && focus.c === c;
                      const isEditing = editing && editing.pos.r === r && editing.pos.c === c;
                      const cs = cellStyle(cell);
                      return (
                        <td key={c} rowSpan={cell.rs || 1} colSpan={cell.cs || 1}
                          onMouseDown={e => {
                            if (e.button !== 0) return;
                            e.preventDefault(); // no text selection / native drag while picking cells
                            if (onBorder(e, r, c, cell)) {
                              moving.current = { src: range, grabR: r - range.r1, grabC: c - range.c1 };
                              setMoveTo({ r: range.r1, c: range.c1 });
                              gridRef.current?.focus();
                              return;
                            }
                            if (editing) finishEdit(true);
                            dragging.current = true;
                            if (e.shiftKey) setFocus({ r, c }); else { setAnchor({ r, c }); setFocus({ r, c }); }
                            gridRef.current?.focus();
                          }}
                          onMouseMove={e => {
                            if (moving.current || dragging.current) return;
                            e.currentTarget.style.cursor = onBorder(e, r, c, cell) ? 'move' : 'cell';
                          }}
                          onMouseEnter={() => {
                            const mv = moving.current;
                            if (mv) {
                              const h = mv.src.r2 - mv.src.r1, w = mv.src.c2 - mv.src.c1;
                              setMoveTo({
                                r: Math.max(0, Math.min(t.rows.length - 1 - h, r - mv.grabR)),
                                c: Math.max(0, Math.min(t.cols.length - 1 - w, c - mv.grabC)),
                              });
                              return;
                            }
                            if (dragging.current) setFocus({ r, c });
                          }}
                          onDoubleClick={() => { setAnchor({ r, c }); setFocus({ r, c }); setEditing({ pos: { r, c }, text: cell.v || '' }); }}
                          style={{
                            ...cs,
                            borderTop: cs.borderTop || '1px solid #e3e6e8',
                            borderRight: cs.borderRight || '1px solid #e3e6e8',
                            borderBottom: cs.borderBottom || '1px solid #e3e6e8',
                            borderLeft: cs.borderLeft || '1px solid #e3e6e8',
                            background: sel && !isFocus ? (cell.bg ? cell.bg : '#e8f0fe') : (cell.bg || (row.repeat && rowUsesList(t, r) ? '#fffbeb' : '#fff')),
                            boxShadow: (() => {
                              if (!sel) return undefined;
                              const ed = edgesOf(r, c, cell);
                              const sh = [
                                ed.top && `inset 0 2px 0 ${SELECT_BLUE}`, ed.bottom && `inset 0 -2px 0 ${SELECT_BLUE}`,
                                ed.left && `inset 2px 0 0 ${SELECT_BLUE}`, ed.right && `inset -2px 0 0 ${SELECT_BLUE}`,
                              ].filter(Boolean);
                              return sh.length ? sh.join(', ') : undefined;
                            })(),
                            outline: inMoveTarget(r, c) ? `2px dashed ${SELECT_BLUE}` : undefined,
                            outlineOffset: -3,
                            position: 'relative', overflow: 'hidden', cursor: 'cell',
                          }}>
                          {isEditing ? (
                            <textarea autoFocus value={editing!.text}
                              onMouseDown={e => e.stopPropagation()}
                              onDoubleClick={e => e.stopPropagation()}
                              onChange={e => setEditing({ ...editing!, text: e.target.value })}
                              onBlur={() => finishEdit(true)}
                              onKeyDown={e => {
                                e.stopPropagation();
                                if (e.key === 'Enter' && !e.altKey && !e.shiftKey) { e.preventDefault(); finishEdit(true, () => move(1, 0)); }
                                else if (e.key === 'Tab') { e.preventDefault(); finishEdit(true, () => move(0, e.shiftKey ? -1 : 1)); }
                                else if (e.key === 'Escape') { e.preventDefault(); finishEdit(false); }
                              }}
                              onFocus={e => { const v = e.currentTarget.value; e.currentTarget.setSelectionRange(v.length, v.length); }}
                              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', minHeight: 22, border: `2px solid ${SELECT_BLUE}`, outline: 'none', resize: 'none', font: 'inherit', fontSize: cs.fontSize, padding: '2px 5px', zIndex: 5, background: '#fff', color: '#111' }} />
                          ) : isLogoCell(cell.v) ? (
                            branding?.logo_data_uri
                              ? <LogoImg src={branding.logo_data_uri} cell={cell} height={spanHeight(t, r, cell.rs || 1)} />
                              : <CellText v={cell.v || ''} kind={kind} />
                          ) : <CellText v={cell.v || ''} kind={kind} />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Text style={{ color: 'rgba(240,237,230,0.5)', fontSize: 12, display: 'block', marginTop: 6 }}>
            Works like Excel: click a cell and type, double-click to edit, drag or Shift-click to select several cells. To move
            cells, point at the blue border of the selection (the pointer becomes a cross of arrows) and drag it to the new place.
            Ctrl+C / Ctrl+X / Ctrl+V copy, cut and paste. Drag the edges of the column letters / row numbers to resize — a logo
            grows to fill its cell. Alt+Enter adds a new line inside a cell. Blue {'{{fields}}'} are filled in
            with real data when the document is printed. Yellow rows (↻) repeat once per item.
          </Text>
        </>
      )}

      {mode === 'preview' && (
        <div style={{ background: '#fff', borderRadius: 2, padding: 38, width: 794, maxWidth: '100%', minHeight: 1123, boxSizing: 'border-box', boxShadow: '0 2px 10px rgba(0,0,0,0.4)' }}>
          <GridDocument template={t} fields={sample.fields} lists={sample.lists} logo={branding?.logo_data_uri} />
        </div>
      )}
    </div>
  );
}

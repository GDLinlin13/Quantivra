import type { CSSProperties } from 'react';
import { expandTemplate, isLogoCell, type GridCell, type GridTemplate, type FieldValues, type ListValues } from '../utils/gridTemplate';

export const GRID_LINE = '1px solid #333';

export function cellStyle(cell: GridCell): CSSProperties {
  return {
    fontWeight: cell.b ? 700 : 400,
    fontStyle: cell.i ? 'italic' : 'normal',
    textDecoration: cell.u ? 'underline' : 'none',
    textAlign: cell.al || 'left',
    verticalAlign: cell.va || 'top',
    fontSize: cell.fs || 12,
    color: cell.c || '#111',
    background: cell.bg || 'transparent',
    borderTop: cell.bt ? GRID_LINE : undefined,
    borderRight: cell.br ? GRID_LINE : undefined,
    borderBottom: cell.bb ? GRID_LINE : undefined,
    borderLeft: cell.bl ? GRID_LINE : undefined,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    padding: '3px 6px',
    lineHeight: 1.35,
  };
}

/** Height (px) of the rows a cell covers, so a logo can fill the whole cell. */
export function spanHeight(t: GridTemplate, r: number, rs = 1): number {
  let h = 0;
  for (let i = r; i < Math.min(r + rs, t.rows.length); i++) h += t.rows[i].h || 22;
  return h;
}

/**
 * The logo grows to fit its (merged) cell and always keeps its shape; the cell's alignment
 * positions it. Sized with max-width / max-height rather than object-fit, because the PDF
 * maker (html2canvas) ignores object-fit and would stretch the picture.
 */
export function LogoImg({ src, cell, height }: { src: string; cell: GridCell; height: number }) {
  const justify = cell.al === 'center' ? 'center' : cell.al === 'right' ? 'flex-end' : 'flex-start';
  const align = cell.va === 'middle' ? 'center' : cell.va === 'bottom' ? 'flex-end' : 'flex-start';
  const h = Math.max(12, height - 8);
  return (
    <div style={{ display: 'flex', justifyContent: justify, alignItems: align, width: '100%', height: h }}>
      <img src={src} alt="" draggable={false}
        style={{ display: 'block', width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: h, pointerEvents: 'none' }} />
    </div>
  );
}

/** Text with an accounting amount ("$<tab>1,234.50") shows the symbol at the left and the number at the right. */
export function CellValue({ text }: { text: string }) {
  const i = text.indexOf('\t');
  if (i < 0) return <>{text}</>;
  return (
    <span style={{ display: 'flex', justifyContent: 'space-between', gap: 6, width: '100%' }}>
      <span>{text.slice(0, i)}</span><span style={{ textAlign: 'right' }}>{text.slice(i + 1).replace(/\t/g, ' ')}</span>
    </span>
  );
}

/**
 * Prints a spreadsheet-style layout with real data filled in. Inline styles
 * only, so it survives being copied into the print / save-as-PDF window.
 */
export function GridDocument({ template, fields, lists, logo }: {
  template: GridTemplate; fields: FieldValues; lists: ListValues; logo?: string | null;
}) {
  const total = template.cols.reduce((a, b) => a + b, 0) || 1;
  const rows = expandTemplate(template, fields, lists);
  return (
    <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111' }}>
      <colgroup>{template.cols.map((w, i) => <col key={i} style={{ width: `${(w / total) * 100}%` }} />)}</colgroup>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} style={{ height: row.h || 22 }}>
            {row.cells.map(oc => (
              <td key={oc.c} rowSpan={oc.rowSpan} colSpan={oc.colSpan} style={cellStyle(oc.cell)}>
                {isLogoCell(oc.cell.v)
                  ? (logo ? <LogoImg src={logo} cell={oc.cell} height={spanHeight(template, oc.r, oc.cell.rs || 1)} /> : null)
                  : <CellValue text={oc.text} />}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

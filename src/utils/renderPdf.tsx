import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { elementsToPdf } from './payslipFiles';

/** Draw a print view off-screen and turn it into a PDF. */
/** A4 page width in screen pixels: documents are drawn this wide, on screen and in the PDF. */
export const A4_PX = 794;
/** A popup that shows a document at A4 width (the page plus the popup's own padding). */
/** The part of an A4 page inside its 10 mm margins (718 px at 96 dpi): what is drawn into the PDF, so the PDF has real A4 scale. */
export const A4_CONTENT_PX = 718;
/** One A4 page on screen: 210 × 297 mm, with the 10 mm margins the PDF has. */
export const A4_FRAME = { width: A4_PX, maxWidth: '100%', minHeight: 1123, margin: '0 auto', padding: 38, boxSizing: 'border-box', background: '#fff', borderRadius: 2 } as const;
/** The document itself, as wide as the page's content and at least as tall (a short one still fills the page). */
export const A4_PAGE = { background: '#fff', padding: 24, width: A4_CONTENT_PX, maxWidth: '100%', minHeight: 1047, boxSizing: 'border-box' } as const;
export const A4_MODAL = `min(${A4_PX + 48}px, 96vw)`;

export async function renderPdf(node: ReactNode): Promise<Blob> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:718px;background:#fff';
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(<>{node}</>);
    await new Promise(r => setTimeout(r, 500)); // let the logo load
    const el = host.firstElementChild as HTMLElement | null;
    if (!el) throw new Error('Nothing to print');
    return await elementsToPdf([el]);
  } finally {
    root.unmount();
    host.remove();
  }
}


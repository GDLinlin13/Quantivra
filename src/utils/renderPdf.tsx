import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { elementsToPdf } from './payslipFiles';

/** Draw a print view off-screen and turn it into a PDF. */
/** A4 page width in screen pixels: documents are drawn this wide, on screen and in the PDF. */
export const A4_PX = 794;
/** A popup that shows a document at A4 width (the page plus the popup's own padding). */
export const A4_MODAL = `min(${A4_PX + 48}px, 96vw)`;

export async function renderPdf(node: ReactNode): Promise<Blob> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff';
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


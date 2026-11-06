import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { elementsToPdf } from './payslipFiles';

/** Draw a print view off-screen and turn it into a PDF. */
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


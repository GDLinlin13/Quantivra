import { useEffect } from 'react';

/**
 * Switches the browser's autofill and "suggestions from earlier" off in every box, now and for boxes that
 * appear later (drawers, pop-ups, new rows). Sign-in's own username / password boxes are left as they are,
 * so the browser can still offer a saved login there.
 */
const KEEP = new Set(['username', 'current-password', 'new-password', 'one-time-code']);

function quiet(root: ParentNode) {
  root.querySelectorAll('input, textarea, select, form').forEach(el => {
    const v = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (!KEEP.has(v) && v !== 'off') el.setAttribute('autocomplete', 'off');
  });
}

export function NoAutofill() {
  useEffect(() => {
    quiet(document);
    const obs = new MutationObserver(muts => {
      for (const m of muts) m.addedNodes.forEach(n => { if (n instanceof HTMLElement) { quiet(n); if (n.matches('input, textarea, select, form')) quiet(n.parentElement || document); } });
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return null;
}

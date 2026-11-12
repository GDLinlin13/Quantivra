// Sign in again after the browser was closed. A tab's own storage is cleared when it closes, but some browsers bring
// tabs back ("continue where you left off", "reopen closed window") with it. So every open tab leaves a heartbeat;
// a tab that opens with no other live tab, and was not simply reloaded, means the browser had been closed.
const TABS = 'qv_tabs';
const MY_ID = 'qv_tab_id';
const LEFT = 'qv_left';
const STALE = 150_000;     // a tab in the background beats slowly; one silent this long is gone
const RELOAD = 10_000;     // a tab that left less than this long ago is being reloaded

let started = false;

function readTabs(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(TABS) || '{}') || {}; } catch { return {}; }
}
function writeTabs(t: Record<string, number>) {
  try { localStorage.setItem(TABS, JSON.stringify(t)); } catch { /* ignore */ }
}

/** True when this page is the first one open since the browser was closed. Call once, when the app starts. */
export function browserWasClosed(): boolean {
  if (started) return false;
  started = true;
  try {
    const now = Date.now();
    let id = sessionStorage.getItem(MY_ID);
    if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem(MY_ID, id); }
    const tabs = readTabs();
    for (const k of Object.keys(tabs)) if (now - tabs[k] > STALE) delete tabs[k];
    const others = Object.keys(tabs).filter(k => k !== id);
    const left = Number(sessionStorage.getItem(LEFT) || 0);
    const reloading = left > 0 && now - left < RELOAD;
    tabs[id] = now;
    writeTabs(tabs);
    const beat = () => { const t = readTabs(); t[id!] = Date.now(); writeTabs(t); };
    setInterval(beat, 20_000);
    window.addEventListener('pagehide', () => {
      const t = readTabs(); delete t[id!]; writeTabs(t);
      try { sessionStorage.setItem(LEFT, String(Date.now())); } catch { /* ignore */ }
    });
    window.addEventListener('pageshow', e => { if ((e as PageTransitionEvent).persisted) beat(); });
    return others.length === 0 && !reloading;
  } catch {
    return false;
  }
}

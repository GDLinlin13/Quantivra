import { describe, it, expect, beforeEach, vi } from 'vitest';

// a tiny browser: two kinds of storage, and a window to listen on
function fakeStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), clear: () => m.clear() };
}

describe('browserWasClosed', () => {
  let local: ReturnType<typeof fakeStorage>, session: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    local = fakeStorage(); session = fakeStorage();
    vi.stubGlobal('localStorage', local); vi.stubGlobal('sessionStorage', session);
    vi.stubGlobal('window', { addEventListener: () => {} });
  });
  const load = async () => (await import('../sessionGuard')).browserWasClosed;

  it('the first page after the browser was closed asks to sign in again', async () => {
    expect((await load())()).toBe(true);
  });
  it('a second tab, while another is open, does not', async () => {
    local.setItem('qv_tabs', JSON.stringify({ other: Date.now() }));
    expect((await load())()).toBe(false);
  });
  it('a reload of the same tab does not', async () => {
    session.setItem('qv_tab_id', 'me'); session.setItem('qv_left', String(Date.now() - 2000));
    expect((await load())()).toBe(false);
  });
  it('a tab brought back by the browser long after it left does', async () => {
    session.setItem('qv_tab_id', 'me'); session.setItem('qv_left', String(Date.now() - 3_600_000));
    expect((await load())()).toBe(true);
  });
  it('a tab that went silent long ago no longer counts as open', async () => {
    local.setItem('qv_tabs', JSON.stringify({ ghost: Date.now() - 600_000 }));
    expect((await load())()).toBe(true);
  });
});

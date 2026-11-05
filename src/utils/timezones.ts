// Every IANA timezone the browser knows, labelled with its current UTC offset,
// e.g. "Asia/Singapore (UTC+08:00)".

const FALLBACK = [
  'UTC', 'Asia/Singapore', 'Asia/Kuala_Lumpur', 'Asia/Jakarta', 'Asia/Bangkok', 'Asia/Manila', 'Asia/Ho_Chi_Minh',
  'Asia/Hong_Kong', 'Asia/Taipei', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul', 'Asia/Kolkata', 'Asia/Dubai', 'Asia/Riyadh',
  'Australia/Sydney', 'Pacific/Auckland', 'Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Amsterdam',
  'Europe/Zurich', 'Europe/Madrid', 'Europe/Rome', 'America/New_York', 'America/Chicago', 'America/Los_Angeles',
  'America/Toronto', 'America/Mexico_City', 'America/Sao_Paulo',
];

function offsetLabel(tz: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'longOffset' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value || '';
    const m = part.match(/GMT([+-]\d{2}:\d{2})?/);
    return m ? `UTC${m[1] || '+00:00'}` : '';
  } catch { return ''; }
}

let cache: { value: string; label: string }[] | null = null;

export function timezoneOptions(): { value: string; label: string }[] {
  if (cache) return cache;
  const supported = (Intl as any).supportedValuesOf?.('timeZone') as string[] | undefined;
  // Always include the common modern names: some browsers list e.g. Ho Chi Minh
  // and Kolkata only under their older names (Saigon, Calcutta).
  const zones = Array.from(new Set([...(supported ?? []), ...FALLBACK]));
  cache = zones
    .map(z => ({ value: z, label: `${z.replace(/_/g, ' ')}${offsetLabel(z) ? ` (${offsetLabel(z)})` : ''}` }))
    .sort((a, b) => a.value.localeCompare(b.value));
  return cache;
}

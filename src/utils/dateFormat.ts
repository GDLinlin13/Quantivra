import dayjs from 'dayjs';

// How dates are shown in the company (Settings → Date format). Dates are stored as YYYY-MM-DD either way.
export const DATE_FORMATS = [
  { value: 'YYYY-MM-DD', label: '2026-08-31' },
  { value: 'DD/MM/YYYY', label: '31/08/2026' },
  { value: 'MM/DD/YYYY', label: '08/31/2026' },
  { value: 'DD-MM-YYYY', label: '31-08-2026' },
  { value: 'DD.MM.YYYY', label: '31.08.2026' },
  { value: 'D MMM YYYY', label: '31 Aug 2026' },
  { value: 'MMM D, YYYY', label: 'Aug 31, 2026' },
  { value: 'DD MMMM YYYY', label: '31 August 2026' },
];
export const DEFAULT_DATE_FORMAT = 'YYYY-MM-DD';
export const isDateFormat = (f: unknown): f is string => typeof f === 'string' && DATE_FORMATS.some(x => x.value === f);

let current = DEFAULT_DATE_FORMAT;
export const getDateFormat = () => current;
export const setDateFormat = (f?: string | null) => { current = isDateFormat(f) ? f : DEFAULT_DATE_FORMAT; };

/** A date (or the date part of a timestamp) in the company's format; anything that is not a date is returned as it is. */
export function fmtDate(v: string | Date | null | undefined, format: string = current): string {
  if (v == null || v === '') return '';
  const d = dayjs(v);
  return d.isValid() ? d.format(format) : String(v);
}

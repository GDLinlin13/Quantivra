// Every ISO currency the browser knows, labelled with its name,
// e.g. "SGD — Singapore Dollar".

const COMMON = ['SGD', 'MYR', 'IDR', 'THB', 'PHP', 'VND', 'HKD', 'TWD', 'JPY', 'KRW', 'CNY', 'USD', 'GBP', 'AUD', 'EUR',
  'INR', 'NZD', 'CAD', 'AED', 'CHF', 'SAR', 'BRL', 'MXN'];

let cache: { value: string; label: string }[] | null = null;

export function currencyOptions(): { value: string; label: string }[] {
  if (cache) return cache;
  const supported = ((Intl as any).supportedValuesOf?.('currency') as string[] | undefined) ?? [];
  let names: { of(code: string): string | undefined } | null = null;
  try { names = new (Intl as any).DisplayNames(['en'], { type: 'currency' }); } catch { names = null; }
  cache = Array.from(new Set([...supported, ...COMMON]))
    .sort()
    .map(code => {
      const name = names?.of(code);
      return { value: code, label: name && name !== code ? `${code} — ${name}` : code };
    });
  return cache;
}

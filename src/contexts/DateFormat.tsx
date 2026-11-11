import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from 'react';
import { ConfigProvider } from 'antd';
import enUSLocale from 'antd/locale/en_US';

// the built app can hand over the locale wrapped as { default }; take the real one either way
const enUS: any = (enUSLocale as any)?.DatePicker ? enUSLocale : (enUSLocale as any)?.default;
import { useAuth } from './AuthContext';
import { supabase } from '../utils/supabase';
import { DEFAULT_DATE_FORMAT, isDateFormat, setDateFormat } from '../utils/dateFormat';

interface Ctx { format: string; save: (f: string) => Promise<void> }
const DateFormatContext = createContext<Ctx>({ format: DEFAULT_DATE_FORMAT, save: async () => undefined });
export const useDateFormat = () => useContext(DateFormatContext);

/** Loads the company's date format; every date picker and every date shown follows it. */
export function DateFormatProvider({ children }: { children: ReactNode }) {
  const { companyId } = useAuth();
  const [format, setFormat] = useState(DEFAULT_DATE_FORMAT);
  useEffect(() => {
    if (!companyId) return;
    supabase.from('company_settings').select('value').eq('company_id', companyId).eq('category', 'company').eq('key', 'date_format').maybeSingle()
      .then(({ data }) => { const f = isDateFormat(data?.value?.format) ? data!.value.format : DEFAULT_DATE_FORMAT; setDateFormat(f); setFormat(f); });
  }, [companyId]);
  const save = useCallback(async (f: string) => {
    const { error } = await supabase.from('company_settings').upsert(
      { company_id: companyId, category: 'company', key: 'date_format', value: { format: f } }, { onConflict: 'company_id,category,key' });
    if (error) throw new Error(error.message);
    setDateFormat(f); setFormat(f);
  }, [companyId]);
  // date pickers show and read dates in the chosen format
  const locale = useMemo(() => {
    const dp = enUS?.DatePicker;
    if (!dp?.lang) return enUS; // never take the page down over a date picker
    return { ...enUS, DatePicker: { ...dp, lang: { ...dp.lang, fieldDateFormat: format } } };
  }, [format]);
  return (
    <DateFormatContext.Provider value={{ format, save }}>
      <ConfigProvider locale={locale}>
        {/* re-render everything below when the format changes, so shown dates follow */}
        <div key={format} style={{ display: 'contents' }}>{children}</div>
      </ConfigProvider>
    </DateFormatContext.Provider>
  );
}

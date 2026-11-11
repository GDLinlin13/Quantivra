// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { createElement } from 'react';
import { ConfigProvider, DatePicker } from 'antd';
import enUS from 'antd/locale/en_US';
import dayjs from 'dayjs';

describe('date picker follows the company format', () => {
  it('shows the picked date in the format from the locale', () => {
    const locale = { ...enUS, DatePicker: { ...enUS.DatePicker!, lang: { ...enUS.DatePicker!.lang, fieldDateFormat: 'DD/MM/YYYY' } } };
    const html = renderToString(createElement(ConfigProvider, { locale }, createElement(DatePicker, { value: dayjs('2026-08-31') })));
    expect(html).toContain('31/08/2026');
  });
});

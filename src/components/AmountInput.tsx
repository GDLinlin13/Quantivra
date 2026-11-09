import { InputNumber, type InputNumberProps } from 'antd';

/** Thousands commas on the whole-number part only (1,234,567.89), never inside the decimals. */
const withCommas = (v: string | number | undefined) => {
  if (v === undefined || v === null || v === '') return '';
  const [whole, dec] = String(v).split('.');
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${dec !== undefined ? `.${dec}` : ''}`;
};

/** A number box for money: shows thousands separators (55,000.00) while typing. */
export function AmountInput(props: InputNumberProps<number>) {
  return <InputNumber<number> {...props} formatter={withCommas} parser={v => Number((v || '').replace(/,/g, '')) as unknown as number} />;
}

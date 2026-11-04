import type { CountryPackConfig } from './countries';

type Bracket = CountryPackConfig['income_tax']['brackets'][number];

/** Marginal bands [from, rate%] → brackets with the cumulative tax at each band's start. */
export function progressive(bands: [number, number][]): Bracket[] {
  let fixed = 0;
  return bands.map(([min, rate], i) => {
    const max = i + 1 < bands.length ? bands[i + 1][0] : null;
    const b = { min, max, rate, fixed: Math.round(fixed * 100) / 100 };
    if (max !== null) fixed += ((max - min) * rate) / 100;
    return b;
  });
}


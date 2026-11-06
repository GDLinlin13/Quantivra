export type RoundingMethod = 'round' | 'ceil' | 'floor' | 'truncate';

export interface RoundingConfig {
  method: RoundingMethod;
  decimals: number;
}

export function roundAmount(
  value: number,
  decimals: number = 2,
  method: RoundingMethod = 'round',
): number {
  const factor = Math.pow(10, decimals);
  const eps = 1e-9 * Math.sign(value); // e.g. 6500 × 0.2 = 1300.0000000000002, 0.1 × 3 = 0.30000000000000004
  switch (method) {
    case 'ceil':
      return Math.ceil(value * factor - eps) / factor;
    case 'floor':
      return Math.floor(value * factor + eps) / factor;
    case 'truncate':
      return value >= 0
        ? Math.floor(value * factor + eps) / factor
        : Math.ceil(value * factor + eps) / factor;
    case 'round':
    default:
      return Math.round(value * factor + eps) / factor;
  }
}

export function roundByConfig(
  value: number,
  config: RoundingConfig,
): number {
  return roundAmount(value, config.decimals, config.method);
}

export function sumAndRound(
  values: number[],
  decimals: number = 2,
  method: RoundingMethod = 'round',
): number {
  const sum = values.reduce((acc, v) => acc + v, 0);
  return roundAmount(sum, decimals, method);
}

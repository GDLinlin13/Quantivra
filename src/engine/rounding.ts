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
  switch (method) {
    case 'ceil':
      return Math.ceil(value * factor) / factor;
    case 'floor':
      return Math.floor(value * factor) / factor;
    case 'truncate':
      return value >= 0
        ? Math.floor(value * factor) / factor
        : Math.ceil(value * factor) / factor;
    case 'round':
    default:
      return Math.round(value * factor) / factor;
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

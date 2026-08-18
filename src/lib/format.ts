import type { Metric } from './types';

export function formatMoney(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) {
    const millions = (dollars / 1_000_000).toFixed(2).replace(/\.?0+$/, '');
    return `$${millions}M`;
  }
  if (dollars >= 10_000) {
    return `$${Math.round(dollars / 1000)}K`;
  }
  return `$${Math.round(dollars).toLocaleString('en-US')}`;
}

/** 1 位小数;顺带清掉 Σsplit 的浮点尘埃(7.999999999999999→8)。 */
export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** 计数类数值(sales_count/listings/split):最多 1 位小数、`.0` 去尾(8→'8'、1.8→'1.8')。 */
export function formatCount(value: number): string {
  const rounded = round1(value);
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function formatValue(metric: Metric, value: number): string {
  return metric === 'gci' ? formatMoney(value) : formatCount(value);
}

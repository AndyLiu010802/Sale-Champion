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

export function formatValue(metric: Metric, value: number): string {
  return metric === 'gci' ? formatMoney(value) : String(value);
}

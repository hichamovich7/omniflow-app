/** Shared display formatting for KPI / Weekly Progress numeric values. */
export function formatMetricValue(value: number, unit: 'currency' | 'count'): string {
  return unit === 'currency' ? `${value.toLocaleString()} €` : value.toLocaleString();
}

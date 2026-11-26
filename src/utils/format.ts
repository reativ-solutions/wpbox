const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return '?';

  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${BYTE_UNITS[unit]}`;
}

export function formatPercent(done: number, total: number): string {
  if (!total) return '';
  return `${Math.min(100, Math.floor((done / total) * 100))}%`;
}

export function formatProgress(done: number, total: number): string {
  const percent = formatPercent(done, total);
  const sizes = total ? `${formatBytes(done)} / ${formatBytes(total)}` : formatBytes(done);
  return percent ? `${percent}  (${sizes})` : sizes;
}

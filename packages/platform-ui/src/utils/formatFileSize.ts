const FILE_SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

const formatNumber = (value: number) => {
  const precision = value >= 10 ? 0 : 1;
  return value.toFixed(precision).replace(/\.0$/, '');
};

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B';
  }

  let unitIndex = 0;
  let nextValue = bytes;
  while (nextValue >= 1024 && unitIndex < FILE_SIZE_UNITS.length - 1) {
    nextValue /= 1024;
    unitIndex += 1;
  }

  const unit = FILE_SIZE_UNITS[unitIndex]!;
  const formatted = unitIndex === 0 ? Math.round(nextValue).toString() : formatNumber(nextValue);
  return `${formatted} ${unit}`;
}

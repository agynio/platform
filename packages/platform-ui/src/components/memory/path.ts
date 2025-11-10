export function normalizeMemoryPath(input: string | null | undefined): string {
  if (!input) return '/';
  const trimmed = input.trim();
  if (!trimmed) return '/';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const collapsed = withLeading.replace(/\/+/g, '/');
  if (collapsed.length > 1 && collapsed.endsWith('/')) {
    return collapsed.replace(/\/+$/, '') || '/';
  }
  return collapsed || '/';
}

export function joinMemoryPath(base: string, segment: string): string {
  const normalizedBase = normalizeMemoryPath(base);
  const cleanedSegment = segment.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!cleanedSegment) {
    return normalizedBase;
  }
  if (normalizedBase === '/' || normalizedBase === '') {
    return normalizeMemoryPath(`/${cleanedSegment}`);
  }
  return normalizeMemoryPath(`${normalizedBase}/${cleanedSegment}`);
}

export function memoryPathSegments(path: string): string[] {
  const normalized = normalizeMemoryPath(path);
  const parts = normalized.split('/').filter(Boolean);
  const segments: string[] = ['/'];
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : `/${part}`;
    segments.push(normalizeMemoryPath(current));
  }
  return Array.from(new Set(segments));
}

export function memoryPathParent(path: string): string {
  const normalized = normalizeMemoryPath(path);
  if (normalized === '/' || normalized === '') {
    return '/';
  }
  const parts = normalized.split('/').filter(Boolean);
  parts.pop();
  if (parts.length === 0) {
    return '/';
  }
  return normalizeMemoryPath(`/${parts.join('/')}`);
}

export const DEFAULT_PAGE_SIZE = 20;

export function normalizePageToken(token?: string | null) {
  return token && token.length > 0 ? token : undefined;
}

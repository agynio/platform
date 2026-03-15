export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGES = 50;

export type PaginatedResponse<T> = {
  items: T[];
  nextPageToken?: string | null;
};

export const listAllPages = async <T>(
  fetchPage: (pageToken: string | undefined, pageSize: number) => Promise<PaginatedResponse<T>>,
): Promise<T[]> => {
  const items: T[] = [];
  let pageToken: string | undefined = undefined;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const response = await fetchPage(pageToken, DEFAULT_PAGE_SIZE);
    const pageItems = response.items;
    items.push(...pageItems);
    const nextToken = readString(response.nextPageToken ?? undefined);
    if (!nextToken) break;
    if (nextToken === pageToken) {
      throw new Error('teams_pagination_duplicate_token');
    }
    if (pageItems.length === 0) break;
    pageToken = nextToken;
  }
  return items;
};

export const readString = (value?: string | null): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};
